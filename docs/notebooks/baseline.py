#!/usr/bin/env python3
"""Console Collector Baseline Model"""

import json
import pandas as pd
import numpy as np
from pathlib import Path

def load_data():
    """Load round features data"""
    try:
        # Try to load from JSON first
        json_path = Path("data/round_features.json")
        if json_path.exists():
            with open(json_path) as f:
                data = json.load(f)
                return pd.DataFrame(data['rounds'])
        
        # Fallback to CSV
        csv_path = Path("data/round_features.csv")
        if csv_path.exists():
            return pd.read_csv(csv_path)
        
        raise FileNotFoundError("No round features data found")
        
    except Exception as e:
        print(f"❌ Failed to load data: {e}")
        return None

def run_baseline(df):
    """Run simple baseline model"""
    print("🤖 Running baseline model...")
    
    if 'durationSec' not in df.columns:
        print("⚠️ No duration data available")
        return
    
    # Target: predict duration category
    df['duration_category'] = pd.cut(
        df['durationSec'], 
        bins=[0, 30, 120, float('inf')], 
        labels=['short', 'medium', 'long']
    )
    
    # Simple baseline: predict most common class
    most_common = df['duration_category'].mode()[0]
    baseline_acc = (df['duration_category'] == most_common).mean()
    
    print(f"📏 Duration Classification Baseline")
    print(f"  Target: duration_category")
    print(f"  Baseline: always predict '{most_common}'")
    print(f"  Accuracy: {baseline_acc:.3f}")
    
    # Class distribution
    print(f"  Class distribution:")
    for category in df['duration_category'].unique():
        count = (df['duration_category'] == category).sum()
        pct = count / len(df) * 100
        print(f"    {category}: {count} ({pct:.1f}%)")

def main():
    """Main function"""
    print("🚀 Console Collector Baseline Model")
    
    # Set random seed
    np.random.seed(42)
    
    # Load data
    df = load_data()
    if df is None:
        return
    
    print(f"✅ Loaded {len(df)} rounds")
    
    # Run baseline
    run_baseline(df)
    
    print("\n🎉 Baseline analysis completed!")

if __name__ == "__main__":
    main()
