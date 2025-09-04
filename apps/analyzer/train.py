#!/usr/bin/env python3
"""
Training script for rugs-research
Replaces notebook with scripted pipeline
"""

import json
import os
import sqlite3
import numpy as np
import pandas as pd
from datetime import datetime
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score, roc_curve, precision_recall_curve
from sklearn.calibration import calibration_curve
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import pickle

def load_data(db_path: str) -> tuple:
    """Load data from SQLite database"""
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return None, None
    
    conn = sqlite3.connect(db_path)
    
    # Load rounds and ticks
    rounds_df = pd.read_sql_query("SELECT * FROM rounds", conn)
    ticks_df = pd.read_sql_query("SELECT * FROM ticks", conn)
    
    conn.close()
    
    print(f"Loaded {len(rounds_df)} rounds and {len(ticks_df)} ticks")
    return rounds_df, ticks_df

def engineer_features(rounds_df: pd.DataFrame, ticks_df: pd.DataFrame) -> pd.DataFrame:
    """Engineer features for modeling"""
    # Merge rounds with their ticks
    merged_df = pd.merge(ticks_df, rounds_df, left_on='round_id', right_on='id', suffixes=('_tick', '_round'))
    
    # Calculate time since round start
    merged_df['time_since_start'] = (merged_df['ts'] - merged_df['started_at']) / 1000  # Convert to seconds
    
    # Calculate slope (rate of change in multiplier)
    merged_df['slope'] = merged_df.groupby('round_id')['x'].diff() / merged_df.groupby('round_id')['time_since_start'].diff()
    
    # Calculate rolling volatility (standard deviation of recent x values)
    merged_df['volatility'] = merged_df.groupby('round_id')['x'].rolling(window=5, min_periods=1).std().reset_index(0, drop=True)
    
    # Calculate player and wager deltas
    merged_df['players_delta'] = merged_df.groupby('round_id')['players'].diff()
    merged_df['wager_delta'] = merged_df.groupby('round_id')['totalWager'].diff()
    
    # Fill NaN values
    merged_df = merged_df.fillna(0)
    
    return merged_df

def prepare_training_data(features_df: pd.DataFrame, db_path: str) -> tuple:
    """Prepare data for training rug prediction models"""
    # Only use live phase ticks
    live_ticks = features_df[features_df['phase'] == 'live'].copy()
    
    if len(live_ticks) == 0:
        print("No live phase ticks found")
        return None, None, None
    
    # Create target variables
    live_ticks['rug_in_5s'] = 0
    live_ticks['rug_in_10s'] = 0
    
    # Try to use sidebet windows for more accurate labels
    sidebet_windows_available = False
    try:
        conn = sqlite3.connect(db_path)
        sidebet_windows_df = pd.read_sql_query("SELECT * FROM sidebet_windows", conn)
        conn.close()
        
        if len(sidebet_windows_df) > 0:
            sidebet_windows_available = True
            print(f"Using sidebet windows for labels ({len(sidebet_windows_df)} windows available)")
            
            # Create window-aligned labels
            for round_id in live_ticks['round_id'].unique():
                round_windows = sidebet_windows_df[sidebet_windows_df['round_id'] == round_id].sort_values('window_idx')
                round_ticks = live_ticks[live_ticks['round_id'] == round_id].sort_values('ts')
                
                for idx, tick in round_ticks.iterrows():
                    # Determine which window this tick belongs to
                    time_since_start = (tick['ts'] - tick['started_at']) / 1000  # seconds
                    window_idx = int(time_since_start // 10)
                    
                    # Find the window
                    window = round_windows[round_windows['window_idx'] == window_idx]
                    if len(window) > 0:
                        # Check if rug occurs in this window or future windows
                        future_windows = round_windows[round_windows['window_idx'] >= window_idx]
                        rug_in_future_windows = future_windows['rug_in_window'].any()
                        
                        # 5s and 10s labels based on window boundaries
                        if window_idx < len(round_windows) - 1:  # Not the last window
                            live_ticks.loc[idx, 'rug_in_5s'] = 1 if rug_in_future_windows else 0
                            live_ticks.loc[idx, 'rug_in_10s'] = 1 if rug_in_future_windows else 0
                        else:
                            # Last window - use traditional method
                            live_ticks.loc[idx, 'rug_in_5s'] = 0
                            live_ticks.loc[idx, 'rug_in_10s'] = 0
        else:
            print("No sidebet windows found, using traditional label method")
    except Exception as e:
        print(f"Could not load sidebet windows: {e}. Using traditional label method.")
    
    # Fallback to traditional method if sidebet windows not available
    if not sidebet_windows_available:
        print("Using traditional sliding-window label method")
        for round_id in live_ticks['round_id'].unique():
            round_ticks = live_ticks[live_ticks['round_id'] == round_id].sort_values('ts')
            
            for idx, tick in round_ticks.iterrows():
                # Check if rug happens within 5 seconds
                future_ticks = round_ticks[round_ticks['ts'] > tick['ts']]
                future_ticks_5s = future_ticks[future_ticks['ts'] <= tick['ts'] + 5000]  # 5 seconds
                future_ticks_10s = future_ticks[future_ticks['ts'] <= tick['ts'] + 10000]  # 10 seconds
                
                # Check if any future tick is not live (rug occurred)
                if len(future_ticks_5s) > 0 and not all(future_ticks_5s['phase'] == 'live'):
                    live_ticks.loc[idx, 'rug_in_5s'] = 1
                
                if len(future_ticks_10s) > 0 and not all(future_ticks_10s['phase'] == 'live'):
                    live_ticks.loc[idx, 'rug_in_10s'] = 1
    
    # Select features for modeling
    feature_columns = ['x', 'time_since_start', 'slope', 'volatility', 'players', 'totalWager']
    
    # Remove rows with missing values
    live_ticks = live_ticks.dropna(subset=feature_columns)
    
    X = live_ticks[feature_columns]
    y_5s = live_ticks['rug_in_5s']
    y_10s = live_ticks['rug_in_10s']
    
    return X, y_5s, y_10s

def train_models(X: pd.DataFrame, y_5s: pd.Series, y_10s: pd.Series) -> tuple:
    """Train Random Forest models for rug prediction"""
    # Split data
    X_train, X_test, y_5s_train, y_5s_test = train_test_split(X, y_5s, test_size=0.2, random_state=42)
    _, _, y_10s_train, y_10s_test = train_test_split(X, y_10s, test_size=0.2, random_state=42)
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Train 5-second model
    model_5s = RandomForestClassifier(n_estimators=100, random_state=42, class_weight='balanced')
    model_5s.fit(X_train_scaled, y_5s_train)
    
    # Train 10-second model
    model_10s = RandomForestClassifier(n_estimators=100, random_state=42, class_weight='balanced')
    model_10s.fit(X_train_scaled, y_10s_train)
    
    return model_5s, model_10s, scaler, X_test_scaled, y_5s_test, y_10s_test

def compute_evaluation_metrics(model_5s, model_10s, X_test_scaled, y_5s_test, y_10s_test, feature_names):
    """Compute comprehensive evaluation metrics"""
    metrics = {
        'training_date': datetime.now().isoformat(),
        'models': {}
    }
    
    for horizon, model, y_test in [('5s', model_5s, y_5s_test), ('10s', model_10s, y_10s_test)]:
        # Get predictions
        y_pred = model.predict(X_test_scaled)
        y_proba = model.predict_proba(X_test_scaled)[:, 1]
        
        # ROC metrics
        roc_auc = roc_auc_score(y_test, y_proba)
        fpr, tpr, roc_thresholds = roc_curve(y_test, y_proba)
        
        # Precision-Recall metrics
        precision, recall, pr_thresholds = precision_recall_curve(y_test, y_proba)
        
        # Calibration curve
        fraction_of_positives, mean_predicted_value = calibration_curve(y_test, y_proba, n_bins=10)
        
        # Classification report at threshold 0.5
        y_pred_05 = (y_proba >= 0.5).astype(int)
        report = classification_report(y_test, y_pred_05, output_dict=True)
        
        # Feature importance
        feature_importance = dict(zip(feature_names, model.feature_importances_))
        
        metrics['models'][horizon] = {
            'roc_auc': float(roc_auc),
            'precision_at_05': float(report['1']['precision']),
            'recall_at_05': float(report['1']['recall']),
            'f1_at_05': float(report['1']['f1-score']),
            'support': int(report['1']['support']),
            'roc_curve': {
                'fpr': fpr.tolist(),
                'tpr': tpr.tolist(),
                'thresholds': roc_thresholds.tolist()
            },
            'pr_curve': {
                'precision': precision.tolist(),
                'recall': recall.tolist(),
                'thresholds': pr_thresholds.tolist()
            },
            'calibration_curve': {
                'fraction_of_positives': fraction_of_positives.tolist(),
                'mean_predicted_value': mean_predicted_value.tolist()
            },
            'feature_importance': feature_importance
        }
    
    return metrics

def save_plots(model_5s, model_10s, X_test_scaled, y_5s_test, y_10s_test, metrics):
    """Save ROC and calibration plots"""
    # Ensure exports directory exists
    os.makedirs('../data/exports', exist_ok=True)
    
    # ROC Curves
    plt.figure(figsize=(12, 5))
    
    plt.subplot(1, 2, 1)
    for horizon, model, y_test in [('5s', model_5s, y_5s_test), ('10s', model_10s, y_10s_test)]:
        y_proba = model.predict_proba(X_test_scaled)[:, 1]
        fpr, tpr, _ = roc_curve(y_test, y_proba)
        auc = roc_auc_score(y_test, y_proba)
        plt.plot(fpr, tpr, label=f'{horizon} (AUC = {auc:.3f})')
    
    plt.plot([0, 1], [0, 1], 'k--', label='Random')
    plt.xlabel('False Positive Rate')
    plt.ylabel('True Positive Rate')
    plt.title('ROC Curves')
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    # Calibration Curves
    plt.subplot(1, 2, 2)
    for horizon, model, y_test in [('5s', model_5s, y_5s_test), ('10s', model_10s, y_10s_test)]:
        y_proba = model.predict_proba(X_test_scaled)[:, 1]
        fraction_of_positives, mean_predicted_value = calibration_curve(y_test, y_proba, n_bins=10)
        plt.plot(mean_predicted_value, fraction_of_positives, 'o-', label=f'{horizon}')
    
    plt.plot([0, 1], [0, 1], 'k--', label='Perfectly Calibrated')
    plt.xlabel('Mean Predicted Probability')
    plt.ylabel('Fraction of Positives')
    plt.title('Calibration Curves')
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig('../data/exports/model_evaluation.png', dpi=300, bbox_inches='tight')
    plt.close()
    
    print("✓ Saved evaluation plots to data/exports/model_evaluation.png")

def save_model(model_5s, model_10s, scaler, rounds_df: pd.DataFrame, X: pd.DataFrame, metrics: dict) -> None:
    """Save the trained models to JSON format"""
    # Ensure data directory exists
    os.makedirs('../data', exist_ok=True)
    
    # Serialize models to hex strings
    model_5s_hex = pickle.dumps(model_5s).hex()
    model_10s_hex = pickle.dumps(model_10s).hex()
    scaler_hex = pickle.dumps(scaler).hex()
    
    # Create model data
    model_data = {
        'model_5s': model_5s_hex,
        'model_10s': model_10s_hex,
        'scaler': scaler_hex,
        'features': X.columns.tolist(),
        'rounds_count': len(rounds_df),
        'last_updated': datetime.now().isoformat(),
        'model_type': 'RandomForestClassifier',
        'description': 'Rug prediction models for rugs.fun rounds',
        'version': '1.0.0'
    }
    
    # Save model
    with open('../data/model.json', 'w') as f:
        json.dump(model_data, f, indent=2)
    
    # Save metrics
    metrics['rounds_count'] = len(rounds_df)
    with open('../data/metrics.json', 'w') as f:
        json.dump(metrics, f, indent=2)
    
    print(f"✓ Model saved to ../data/model.json")
    print(f"✓ Metrics saved to ../data/metrics.json")
    print(f"✓ Trained on {len(rounds_df)} rounds")
    print(f"✓ Features: {model_data['features']}")

def print_metrics(metrics: dict):
    """Print metrics to stdout"""
    print("\n" + "="*60)
    print("MODEL EVALUATION METRICS")
    print("="*60)
    
    for horizon, model_metrics in metrics['models'].items():
        print(f"\n{horizon.upper()} MODEL:")
        print(f"  ROC AUC: {model_metrics['roc_auc']:.3f}")
        print(f"  Precision (0.5): {model_metrics['precision_at_05']:.3f}")
        print(f"  Recall (0.5): {model_metrics['recall_at_05']:.3f}")
        print(f"  F1 (0.5): {model_metrics['f1_at_05']:.3f}")
        print(f"  Support: {model_metrics['support']}")
        
        print(f"\n  Feature Importance:")
        sorted_features = sorted(model_metrics['feature_importance'].items(), 
                               key=lambda x: x[1], reverse=True)
        for feature, importance in sorted_features:
            print(f"    {feature}: {importance:.3f}")
    
    print(f"\nTraining Date: {metrics['training_date']}")
    print(f"Rounds Used: {metrics.get('rounds_count', 'N/A')}")

def main():
    """Main training pipeline"""
    print("Starting Rugs Research Training...")
    
    # Load data
    db_path = '../data/rugs.sqlite'
    rounds_df, ticks_df = load_data(db_path)
    
    if rounds_df is None or ticks_df is None:
        print("Failed to load data. Please run the collector first.")
        return
    
    # Engineer features
    print("\nEngineering features...")
    features_df = engineer_features(rounds_df, ticks_df)
    print(f"Engineered features for {len(features_df)} data points")
    
    # Prepare training data
    print("\nPreparing training data...")
    X, y_5s, y_10s = prepare_training_data(features_df, db_path)
    
    if X is None:
        print("Failed to prepare training data.")
        return
    
    print(f"Prepared training data: {len(X)} samples")
    print(f"Rug in 5s rate: {y_5s.mean():.3f}")
    print(f"Rug in 10s rate: {y_10s.mean():.3f}")
    
    # Train models
    print("\nTraining models...")
    model_5s, model_10s, scaler, X_test_scaled, y_5s_test, y_10s_test = train_models(X, y_5s, y_10s)
    
    # Compute evaluation metrics
    print("\nComputing evaluation metrics...")
    metrics = compute_evaluation_metrics(model_5s, model_10s, X_test_scaled, y_5s_test, y_10s_test, X.columns.tolist())
    
    # Save plots
    print("\nSaving evaluation plots...")
    save_plots(model_5s, model_10s, X_test_scaled, y_5s_test, y_10s_test, metrics)
    
    # Save model and metrics
    print("\nSaving model and metrics...")
    save_model(model_5s, model_10s, scaler, rounds_df, X, metrics)
    
    # Print metrics
    print_metrics(metrics)
    
    print("\nTraining complete!")

if __name__ == "__main__":
    main()
