#!/usr/bin/env python3
"""
Evaluation CLI for rugs-research models
"""

import json
import os
import argparse
import numpy as np
from datetime import datetime

def load_metrics(metrics_path: str = "../data/metrics.json") -> dict:
    """Load metrics from JSON file"""
    if not os.path.exists(metrics_path):
        print(f"❌ Metrics file not found: {metrics_path}")
        print("Please run the training script first: python train.py")
        return None
    
    try:
        with open(metrics_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Error loading metrics: {e}")
        return None

def load_model(model_path: str = "../data/model.json") -> dict:
    """Load model info from JSON file"""
    if not os.path.exists(model_path):
        print(f"❌ Model file not found: {model_path}")
        return None
    
    try:
        with open(model_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Error loading model: {e}")
        return None

def print_metrics_summary(metrics: dict):
    """Print a summary of model metrics"""
    print("\n" + "="*80)
    print("RUGS RESEARCH - MODEL EVALUATION")
    print("="*80)
    
    # Training info
    training_date = datetime.fromisoformat(metrics['training_date'].replace('Z', '+00:00'))
    print(f"Training Date: {training_date.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"Rounds Used: {metrics.get('rounds_count', 'N/A')}")
    
    # Model performance
    print("\n" + "-"*80)
    print("MODEL PERFORMANCE")
    print("-"*80)
    
    for horizon, model_metrics in metrics['models'].items():
        print(f"\n{horizon.upper()} MODEL:")
        print(f"  ROC AUC:           {model_metrics['roc_auc']:.3f}")
        print(f"  Precision (0.5):   {model_metrics['precision_at_05']:.3f}")
        print(f"  Recall (0.5):      {model_metrics['recall_at_05']:.3f}")
        print(f"  F1 Score (0.5):    {model_metrics['f1_at_05']:.3f}")
        print(f"  Positive Samples:  {model_metrics['support']}")

def print_feature_importance(metrics: dict):
    """Print feature importance for each model"""
    print("\n" + "-"*80)
    print("FEATURE IMPORTANCE")
    print("-"*80)
    
    for horizon, model_metrics in metrics['models'].items():
        print(f"\n{horizon.upper()} MODEL:")
        sorted_features = sorted(model_metrics['feature_importance'].items(), 
                               key=lambda x: x[1], reverse=True)
        
        for i, (feature, importance) in enumerate(sorted_features, 1):
            bar_length = int(importance * 40)  # Scale to 40 chars
            bar = "█" * bar_length
            print(f"  {i:2d}. {feature:20s} {importance:.3f} {bar}")

def print_threshold_analysis(metrics: dict, threshold: float = 0.5):
    """Print threshold analysis and expected value calculations"""
    print("\n" + "-"*80)
    print(f"THRESHOLD ANALYSIS (threshold = {threshold})")
    print("-"*80)
    
    for horizon, model_metrics in metrics['models'].items():
        print(f"\n{horizon.upper()} MODEL:")
        
        # Find threshold in ROC curve
        roc_thresholds = model_metrics['roc_curve']['thresholds']
        fpr = model_metrics['roc_curve']['fpr']
        tpr = model_metrics['roc_curve']['tpr']
        
        # Find closest threshold
        threshold_idx = np.argmin(np.abs(np.array(roc_thresholds) - threshold))
        actual_threshold = roc_thresholds[threshold_idx]
        actual_fpr = fpr[threshold_idx]
        actual_tpr = tpr[threshold_idx]
        
        print(f"  Threshold:         {actual_threshold:.3f}")
        print(f"  True Positive Rate: {actual_tpr:.3f}")
        print(f"  False Positive Rate: {actual_fpr:.3f}")
        
        # Expected value calculation (simplified)
        # Assuming: EV = (TPR * win_multiplier) - (FPR * loss_multiplier)
        # This is a rough approximation for demonstration
        win_multiplier = 2.0  # Example: win 2x on average
        loss_multiplier = 1.0  # Example: lose 1x on average
        
        ev = (actual_tpr * win_multiplier) - (actual_fpr * loss_multiplier)
        print(f"  Expected Value:    {ev:.3f} (rough estimate)")
        
        # Risk assessment
        if ev > 0:
            print(f"  Risk Assessment:   POSITIVE EV - Consider action")
        else:
            print(f"  Risk Assessment:   NEGATIVE EV - Avoid action")

def print_detailed_curves(metrics: dict):
    """Print detailed curve information"""
    print("\n" + "-"*80)
    print("DETAILED CURVE INFORMATION")
    print("-"*80)
    
    for horizon, model_metrics in metrics['models'].items():
        print(f"\n{horizon.upper()} MODEL:")
        
        # ROC curve key points
        roc_thresholds = model_metrics['roc_curve']['thresholds']
        fpr = model_metrics['roc_curve']['fpr']
        tpr = model_metrics['roc_curve']['tpr']
        
        print(f"  ROC Curve Points:")
        for i, (t, fp, tp) in enumerate(zip(roc_thresholds[:5], fpr[:5], tpr[:5])):
            print(f"    Threshold {t:.3f}: FPR={fp:.3f}, TPR={tp:.3f}")
        if len(roc_thresholds) > 5:
            print(f"    ... and {len(roc_thresholds) - 5} more points")
        
        # Calibration curve
        cal_fraction = model_metrics['calibration_curve']['fraction_of_positives']
        cal_predicted = model_metrics['calibration_curve']['mean_predicted_value']
        
        print(f"  Calibration Curve:")
        for i, (frac, pred) in enumerate(zip(cal_fraction, cal_predicted)):
            print(f"    Predicted {pred:.3f}: Actual {frac:.3f}")

def main():
    """Main evaluation CLI"""
    parser = argparse.ArgumentParser(description='Evaluate rugs-research models')
    parser.add_argument('--threshold', type=float, default=0.5,
                       help='Threshold for expected value calculation (default: 0.5)')
    parser.add_argument('--detailed', action='store_true',
                       help='Show detailed curve information')
    parser.add_argument('--metrics-path', default='../data/metrics.json',
                       help='Path to metrics.json file')
    parser.add_argument('--model-path', default='../data/model.json',
                       help='Path to model.json file')
    
    args = parser.parse_args()
    
    # Load data
    metrics = load_metrics(args.metrics_path)
    model_info = load_model(args.model_path)
    
    if metrics is None:
        return 1
    
    # Print evaluation
    print_metrics_summary(metrics)
    print_feature_importance(metrics)
    print_threshold_analysis(metrics, args.threshold)
    
    if args.detailed:
        print_detailed_curves(metrics)
    
    # Model info
    if model_info:
        print("\n" + "-"*80)
        print("MODEL INFORMATION")
        print("-"*80)
        print(f"Model Type:     {model_info.get('model_type', 'N/A')}")
        print(f"Version:        {model_info.get('version', 'N/A')}")
        print(f"Features:       {', '.join(model_info.get('features', []))}")
        print(f"Description:    {model_info.get('description', 'N/A')}")
    
    print("\n" + "="*80)
    print("Evaluation complete!")
    print("="*80)
    
    return 0

if __name__ == "__main__":
    exit(main())
