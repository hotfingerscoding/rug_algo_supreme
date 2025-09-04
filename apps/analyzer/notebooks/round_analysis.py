#!/usr/bin/env python3
"""
Round Analysis Script for rugs-research
This script performs the same analysis as the Jupyter notebook
"""

import pandas as pd
import numpy as np
import sqlite3
import json
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
from lifelines import KaplanMeierFitter
import pickle
import os

# Set up plotting
plt.style.use('seaborn-v0_8')
sns.set_palette("husl")

def load_data():
    """Load data from SQLite database"""
    db_path = '../data/rugs.sqlite'
    
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}. Please run the collector first.")
        return None, None
    
    conn = sqlite3.connect(db_path)
    
    # Load rounds
    rounds_df = pd.read_sql_query("SELECT * FROM rounds", conn)
    print(f"Loaded {len(rounds_df)} rounds")
    
    # Load ticks
    ticks_df = pd.read_sql_query("SELECT * FROM ticks", conn)
    print(f"Loaded {len(ticks_df)} ticks")
    
    conn.close()
    
    return rounds_df, ticks_df

def engineer_features(rounds_df, ticks_df):
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

def survival_analysis(rounds_df):
    """Perform survival analysis on round durations"""
    
    # Calculate round durations
    rounds_df['duration'] = (rounds_df['ended_at'] - rounds_df['started_at']) / 1000  # seconds
    
    # Filter out incomplete rounds
    complete_rounds = rounds_df[rounds_df['ended_at'].notna()].copy()
    
    if len(complete_rounds) == 0:
        print("No complete rounds found for survival analysis")
        return None
    
    # Fit Kaplan-Meier model
    kmf = KaplanMeierFitter()
    kmf.fit(complete_rounds['duration'], event_observed=np.ones(len(complete_rounds)))
    
    # Create plots
    plt.figure(figsize=(12, 8))
    
    plt.subplot(2, 2, 1)
    kmf.plot()
    plt.title('Survival Function: Round Duration')
    plt.xlabel('Time (seconds)')
    plt.ylabel('Survival Probability')
    
    plt.subplot(2, 2, 2)
    plt.hist(complete_rounds['duration'], bins=30, alpha=0.7, edgecolor='black')
    plt.title('Round Duration Distribution')
    plt.xlabel('Duration (seconds)')
    plt.ylabel('Frequency')
    
    plt.subplot(2, 2, 3)
    plt.scatter(complete_rounds['max_x'], complete_rounds['duration'], alpha=0.6)
    plt.title('Max Multiplier vs Duration')
    plt.xlabel('Max Multiplier')
    plt.ylabel('Duration (seconds)')
    
    plt.subplot(2, 2, 4)
    rug_rounds = complete_rounds[complete_rounds['rug_x'].notna()]
    if len(rug_rounds) > 0:
        plt.scatter(rug_rounds['rug_x'], rug_rounds['duration'], alpha=0.6, color='red')
        plt.title('Rug Multiplier vs Duration')
        plt.xlabel('Rug Multiplier')
        plt.ylabel('Duration (seconds)')
    
    plt.tight_layout()
    plt.savefig('../data/survival_analysis.png', dpi=300, bbox_inches='tight')
    plt.show()
    
    # Print statistics
    print(f"\nSurvival Analysis Statistics:")
    print(f"Total complete rounds: {len(complete_rounds)}")
    print(f"Mean duration: {complete_rounds['duration'].mean():.2f} seconds")
    print(f"Median duration: {complete_rounds['duration'].median():.2f} seconds")
    print(f"Max duration: {complete_rounds['duration'].max():.2f} seconds")
    
    return kmf

def prepare_training_data(features_df):
    """Prepare data for training rug prediction models"""
    
    # Only use live phase ticks
    live_ticks = features_df[features_df['phase'] == 'live'].copy()
    
    if len(live_ticks) == 0:
        print("No live phase ticks found")
        return None, None, None
    
    # Create target variables
    live_ticks['rug_in_5s'] = 0
    live_ticks['rug_in_10s'] = 0
    
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

def train_models(X, y_5s, y_10s):
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
    
    # Evaluate models
    print("\n5-Second Model Performance:")
    y_5s_pred = model_5s.predict(X_test_scaled)
    print(classification_report(y_5s_test, y_5s_pred))
    
    print("\n10-Second Model Performance:")
    y_10s_pred = model_10s.predict(X_test_scaled)
    print(classification_report(y_10s_test, y_10s_pred))
    
    # Feature importance plots
    plt.figure(figsize=(12, 5))
    
    plt.subplot(1, 2, 1)
    feature_importance_5s = pd.DataFrame({
        'feature': X.columns,
        'importance': model_5s.feature_importances_
    }).sort_values('importance', ascending=True)
    
    plt.barh(range(len(feature_importance_5s)), feature_importance_5s['importance'])
    plt.yticks(range(len(feature_importance_5s)), feature_importance_5s['feature'])
    plt.title('Feature Importance - 5s Model')
    plt.xlabel('Importance')
    
    plt.subplot(1, 2, 2)
    feature_importance_10s = pd.DataFrame({
        'feature': X.columns,
        'importance': model_10s.feature_importances_
    }).sort_values('importance', ascending=True)
    
    plt.barh(range(len(feature_importance_10s)), feature_importance_10s['importance'])
    plt.yticks(range(len(feature_importance_10s)), feature_importance_10s['feature'])
    plt.title('Feature Importance - 10s Model')
    plt.xlabel('Importance')
    
    plt.tight_layout()
    plt.savefig('../data/feature_importance.png', dpi=300, bbox_inches='tight')
    plt.show()
    
    return model_5s, model_10s, scaler

def save_model(model_5s, model_10s, scaler, rounds_df):
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
        'features': ['x', 'time_since_start', 'slope', 'volatility', 'players', 'totalWager'],
        'rounds_count': len(rounds_df),
        'last_updated': datetime.now().isoformat(),
        'model_type': 'RandomForestClassifier',
        'description': 'Rug prediction models for rugs.fun rounds'
    }
    
    # Save to JSON file
    with open('../data/model.json', 'w') as f:
        json.dump(model_data, f, indent=2)
    
    print(f"Model saved to ../data/model.json")
    print(f"Trained on {len(rounds_df)} rounds")
    print(f"Features: {model_data['features']}")

def main():
    """Main analysis pipeline"""
    print("Starting Rugs Research Analysis...")
    
    # Load data
    rounds_df, ticks_df = load_data()
    if rounds_df is None:
        return
    
    # Engineer features
    print("\nEngineering features...")
    features_df = engineer_features(rounds_df, ticks_df)
    print(f"Engineered features for {len(features_df)} data points")
    
    # Survival analysis
    print("\nPerforming survival analysis...")
    survival_analysis(rounds_df)
    
    # Prepare training data
    print("\nPreparing training data...")
    X, y_5s, y_10s = prepare_training_data(features_df)
    if X is None:
        return
    
    print(f"Prepared training data: {len(X)} samples")
    print(f"Rug in 5s rate: {y_5s.mean():.3f}")
    print(f"Rug in 10s rate: {y_10s.mean():.3f}")
    
    # Train models
    print("\nTraining models...")
    model_5s, model_10s, scaler = train_models(X, y_5s, y_10s)
    
    # Save model
    print("\nSaving model...")
    save_model(model_5s, model_10s, scaler, rounds_df)
    
    print("\nAnalysis complete!")

if __name__ == "__main__":
    main()
