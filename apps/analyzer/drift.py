#!/usr/bin/env python3
"""
Drift monitoring for rugs-research models
"""

import json
import os
import sqlite3
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import argparse

def load_metrics(metrics_path: str = "../data/metrics.json") -> dict:
    """Load training metrics baseline"""
    if not os.path.exists(metrics_path):
        print(f"❌ Metrics file not found: {metrics_path}")
        return None
    
    try:
        with open(metrics_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Error loading metrics: {e}")
        return None

def load_recent_data(db_path: str = "../data/rugs.sqlite", rounds_limit: int = 200) -> pd.DataFrame:
    """Load recent rounds data for drift analysis"""
    if not os.path.exists(db_path):
        print(f"❌ Database not found: {db_path}")
        return None
    
    try:
        conn = sqlite3.connect(db_path)
        
        # Get recent rounds
        query = f"""
        SELECT * FROM rounds 
        WHERE ended_at IS NOT NULL 
        ORDER BY ended_at DESC 
        LIMIT {rounds_limit}
        """
        rounds_df = pd.read_sql_query(query, conn)
        
        # Get ticks for these rounds
        if len(rounds_df) > 0:
            round_ids = rounds_df['id'].tolist()
            placeholders = ','.join(['?' for _ in round_ids])
            ticks_query = f"""
            SELECT * FROM ticks 
            WHERE round_id IN ({placeholders})
            ORDER BY ts
            """
            ticks_df = pd.read_sql_query(ticks_query, conn, params=round_ids)
        else:
            ticks_df = pd.DataFrame()
        
        conn.close()
        
        return rounds_df, ticks_df
        
    except Exception as e:
        print(f"❌ Error loading recent data: {e}")
        return None, None

def compute_baseline_metrics(rounds_df: pd.DataFrame, ticks_df: pd.DataFrame) -> dict:
    """Compute baseline metrics from training data"""
    if len(rounds_df) == 0:
        return None
    
    # Basic round statistics
    baseline = {
        'total_rounds': len(rounds_df),
        'avg_duration': rounds_df['ended_at'].sub(rounds_df['started_at']).mean() / 1000,  # seconds
        'avg_max_x': rounds_df['max_x'].mean(),
        'avg_rug_x': rounds_df['rug_x'].mean(),
        'rug_rate': (rounds_df['rug_x'].notna()).mean(),
        'rug_timing': {}
    }
    
    # Rug timing distribution
    rug_rounds = rounds_df[rounds_df['rug_x'].notna()].copy()
    if len(rug_rounds) > 0:
        rug_rounds['duration'] = (rug_rounds['ended_at'] - rug_rounds['started_at']) / 1000
        
        # Time-based rug distribution
        time_bins = [0, 10, 30, 60, 120, 300, float('inf')]
        time_labels = ['0-10s', '10-30s', '30-60s', '1-2m', '2-5m', '5m+']
        
        rug_rounds['time_bin'] = pd.cut(rug_rounds['duration'], bins=time_bins, labels=time_labels)
        time_dist = rug_rounds['time_bin'].value_counts(normalize=True).to_dict()
        baseline['rug_timing']['time_distribution'] = time_dist
        
        # Multiplier-based rug distribution
        x_bins = [0, 1.5, 2, 3, 5, 10, float('inf')]
        x_labels = ['0-1.5x', '1.5-2x', '2-3x', '3-5x', '5-10x', '10x+']
        
        rug_rounds['x_bin'] = pd.cut(rug_rounds['rug_x'], bins=x_bins, labels=x_labels)
        x_dist = rug_rounds['x_bin'].value_counts(normalize=True).to_dict()
        baseline['rug_timing']['multiplier_distribution'] = x_dist
    
    return baseline

def compute_recent_metrics(rounds_df: pd.DataFrame, ticks_df: pd.DataFrame) -> dict:
    """Compute metrics from recent data"""
    return compute_baseline_metrics(rounds_df, ticks_df)

def compare_distributions(baseline_dist: dict, recent_dist: dict, threshold_pct: float = 20.0) -> dict:
    """Compare distributions and detect drift"""
    drift_results = {
        'drift_detected': False,
        'drift_details': [],
        'overall_drift_score': 0.0
    }
    
    total_drift = 0
    comparisons = 0
    
    # Compare time distribution
    if 'time_distribution' in baseline_dist and 'time_distribution' in recent_dist:
        baseline_time = baseline_dist['time_distribution']
        recent_time = recent_dist['time_distribution']
        
        for bin_name in set(baseline_time.keys()) | set(recent_time.keys()):
            baseline_val = baseline_time.get(bin_name, 0)
            recent_val = recent_time.get(bin_name, 0)
            
            if baseline_val > 0:
                drift_pct = abs(recent_val - baseline_val) / baseline_val * 100
                total_drift += drift_pct
                comparisons += 1
                
                if drift_pct > threshold_pct:
                    drift_results['drift_details'].append({
                        'metric': 'time_distribution',
                        'bin': bin_name,
                        'baseline': baseline_val,
                        'recent': recent_val,
                        'drift_pct': drift_pct
                    })
    
    # Compare multiplier distribution
    if 'multiplier_distribution' in baseline_dist and 'multiplier_distribution' in recent_dist:
        baseline_x = baseline_dist['multiplier_distribution']
        recent_x = recent_dist['multiplier_distribution']
        
        for bin_name in set(baseline_x.keys()) | set(recent_x.keys()):
            baseline_val = baseline_x.get(bin_name, 0)
            recent_val = recent_x.get(bin_name, 0)
            
            if baseline_val > 0:
                drift_pct = abs(recent_val - baseline_val) / baseline_val * 100
                total_drift += drift_pct
                comparisons += 1
                
                if drift_pct > threshold_pct:
                    drift_results['drift_details'].append({
                        'metric': 'multiplier_distribution',
                        'bin': bin_name,
                        'baseline': baseline_val,
                        'recent': recent_val,
                        'drift_pct': drift_pct
                    })
    
    # Overall drift score
    if comparisons > 0:
        drift_results['overall_drift_score'] = total_drift / comparisons
        drift_results['drift_detected'] = drift_results['overall_drift_score'] > threshold_pct
    
    return drift_results

def print_drift_report(baseline_metrics: dict, recent_metrics: dict, drift_results: dict, threshold_pct: float):
    """Print comprehensive drift report"""
    print("\n" + "="*80)
    print("RUGS RESEARCH - DRIFT MONITORING REPORT")
    print("="*80)
    
    print(f"Analysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"Drift Threshold: {threshold_pct}%")
    print(f"Overall Drift Score: {drift_results['overall_drift_score']:.1f}%")
    
    # Baseline vs Recent comparison
    print("\n" + "-"*80)
    print("BASELINE vs RECENT COMPARISON")
    print("-"*80)
    
    print(f"{'Metric':<20} {'Baseline':<15} {'Recent':<15} {'Change':<15}")
    print("-" * 65)
    
    for metric in ['total_rounds', 'avg_duration', 'avg_max_x', 'avg_rug_x', 'rug_rate']:
        baseline_val = baseline_metrics.get(metric, 0)
        recent_val = recent_metrics.get(metric, 0)
        
        if baseline_val != 0:
            change_pct = ((recent_val - baseline_val) / baseline_val) * 100
            change_str = f"{change_pct:+.1f}%"
        else:
            change_str = "N/A"
        
        print(f"{metric:<20} {baseline_val:<15.3f} {recent_val:<15.3f} {change_str:<15}")
    
    # Drift details
    if drift_results['drift_details']:
        print("\n" + "-"*80)
        print("DRIFT DETECTED - SIGNIFICANT CHANGES")
        print("-"*80)
        
        for detail in drift_results['drift_details']:
            print(f"[DRIFT] {detail['metric']} - {detail['bin']}:")
            print(f"  Baseline: {detail['baseline']:.3f}")
            print(f"  Recent:   {detail['recent']:.3f}")
            print(f"  Change:   {detail['drift_pct']:.1f}%")
            print()
    
    # Recommendations
    print("\n" + "-"*80)
    print("RECOMMENDATIONS")
    print("-"*80)
    
    if drift_results['drift_detected']:
        print("⚠️  DRIFT DETECTED - Model performance may be degraded")
        print("   Recommendations:")
        print("   1. Retrain models with recent data")
        print("   2. Adjust feature engineering if needed")
        print("   3. Monitor prediction accuracy closely")
        print("   4. Consider updating drift thresholds")
    else:
        print("✅ No significant drift detected")
        print("   Model should perform well on recent data")
    
    print(f"\n   Overall drift score: {drift_results['overall_drift_score']:.1f}%")
    print(f"   Threshold: {threshold_pct}%")

def main():
    """Main drift monitoring function"""
    parser = argparse.ArgumentParser(description='Monitor model drift')
    parser.add_argument('--rounds', type=int, default=200,
                       help='Number of recent rounds to analyze (default: 200)')
    parser.add_argument('--threshold', type=float, default=20.0,
                       help='Drift threshold percentage (default: 20.0)')
    parser.add_argument('--metrics-path', default='../data/metrics.json',
                       help='Path to metrics.json file')
    parser.add_argument('--db-path', default='../data/rugs.sqlite',
                       help='Path to database file')
    
    args = parser.parse_args()
    
    # Load baseline metrics
    baseline_metrics = load_metrics(args.metrics_path)
    if baseline_metrics is None:
        return 1
    
    # Load recent data
    rounds_df, ticks_df = load_recent_data(args.db_path, args.rounds)
    if rounds_df is None:
        return 1
    
    if len(rounds_df) == 0:
        print("❌ No recent rounds found for analysis")
        return 1
    
    # Compute metrics
    baseline_dist = compute_baseline_metrics(rounds_df, ticks_df)
    recent_dist = compute_recent_metrics(rounds_df, ticks_df)
    
    if baseline_dist is None or recent_dist is None:
        print("❌ Failed to compute metrics")
        return 1
    
    # Compare distributions
    drift_results = compare_distributions(baseline_dist, recent_dist, args.threshold)
    
    # Print report
    print_drift_report(baseline_dist, recent_dist, drift_results, args.threshold)
    
    return 0 if not drift_results['drift_detected'] else 1

if __name__ == "__main__":
    exit(main())
