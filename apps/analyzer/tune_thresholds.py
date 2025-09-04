#!/usr/bin/env python3
"""
Threshold Tuning Script for Rugs Research
Sweeps through cash and sidebet thresholds to find optimal parameters
"""

import json
import os
import sqlite3
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Dict, List, Tuple, Any
import matplotlib.pyplot as plt
matplotlib.use('Agg')  # Use non-interactive backend

# Import local modules
from strategy.ev import EVEngine
from strategy.bankroll import BankrollManager

class ThresholdTuner:
    """Threshold tuning for cash and sidebet decisions"""
    
    def __init__(self, db_path: str = "data/rugs.sqlite", 
                 ev_config_path: str = "config/ev.json"):
        self.db_path = db_path
        self.ev_engine = EVEngine(ev_config_path)
        self.bankroll_manager = BankrollManager()
        
        # Threshold ranges to sweep
        self.cash_thresholds = np.arange(0.15, 0.55, 0.05)  # 0.15 to 0.50
        self.sidebet_thresholds = np.arange(0.25, 0.65, 0.05)  # 0.25 to 0.60
        
        # Results storage
        self.results = []
        self.pareto_optimal = []
    
    def load_data(self) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Load data from SQLite database"""
        if not os.path.exists(self.db_path):
            raise FileNotFoundError(f"Database not found at {self.db_path}")
        
        conn = sqlite3.connect(self.db_path)
        
        # Load rounds and ticks
        rounds_df = pd.read_sql_query("SELECT * FROM rounds", conn)
        ticks_df = pd.read_sql_query("SELECT * FROM ticks", conn)
        
        conn.close()
        
        print(f"Loaded {len(rounds_df)} rounds and {len(ticks_df)} ticks")
        return rounds_df, ticks_df
    
    def engineer_features(self, rounds_df: pd.DataFrame, 
                         ticks_df: pd.DataFrame) -> pd.DataFrame:
        """Engineer features for modeling (reuse from train.py)"""
        # Merge rounds with their ticks
        merged_df = pd.merge(ticks_df, rounds_df, left_on='round_id', right_on='id', 
                            suffixes=('_tick', '_round'))
        
        # Calculate time since round start
        merged_df['time_since_start'] = (merged_df['ts'] - merged_df['started_at']) / 1000
        
        # Calculate slope (rate of change in multiplier)
        merged_df['slope'] = merged_df.groupby('round_id')['x'].diff() / \
                             merged_df.groupby('round_id')['time_since_start'].diff()
        
        # Calculate rolling volatility
        merged_df['volatility'] = merged_df.groupby('round_id')['x'].rolling(
            window=5, min_periods=1).std().reset_index(0, drop=True)
        
        # Fill NaN values
        merged_df = merged_df.fillna(0)
        
        return merged_df
    
    def simulate_with_thresholds(self, features_df: pd.DataFrame, 
                                cash_threshold: float, 
                                sidebet_threshold: float) -> Dict[str, Any]:
        """Simulate trading with given thresholds"""
        # Only use live phase ticks
        live_ticks = features_df[features_df['phase'] == 'live'].copy()
        
        if len(live_ticks) == 0:
            return None
        
        # Initialize simulation state
        initial_bankroll = 1000.0
        current_bankroll = initial_bankroll
        trades = []
        
        # Group by round for simulation
        for round_id in live_ticks['round_id'].unique():
            round_ticks = live_ticks[live_ticks['round_id'] == round_id].sort_values('ts')
            
            for _, tick in round_ticks.iterrows():
                # Mock predictions (in real scenario, these would come from model)
                # For now, use simple heuristics based on features
                p_rug_5s = min(0.9, max(0.1, 
                    (tick['volatility'] * 2 + abs(tick['slope']) * 0.1)))
                p_rug_10s = min(0.95, max(0.15, p_rug_5s * 1.2))
                
                # Get EV-based decision
                ev_result = self.ev_engine.best_action(
                    p_rug_5s, p_rug_10s, tick['x'], current_bankroll
                )
                
                # Apply threshold-based rules
                action = 'HOLD'
                if p_rug_5s > cash_threshold:
                    action = 'CASH'
                elif p_rug_10s > sidebet_threshold and ev_result.action == 'ARM_SIDEBET':
                    action = 'ARM_SIDEBET'
                
                # Execute action
                if action == 'CASH':
                    # Cash out at current multiplier
                    cash_value = tick['x'] * (1 - 0.002)  # Apply slippage
                    profit = cash_value - 1.0  # Assuming 1.0 entry
                    current_bankroll += profit
                    trades.append({
                        'action': 'CASH',
                        'x': tick['x'],
                        'profit': profit,
                        'bankroll': current_bankroll
                    })
                    break  # Round ends
                
                elif action == 'ARM_SIDEBET':
                    # Place sidebet
                    stake = self.bankroll_manager.size_bet(0.1, 4.0)  # Mock edge and odds
                    if stake > 0:
                        trades.append({
                            'action': 'SIDEBET',
                            'stake': stake,
                            'x': tick['x']
                        })
        
        # Calculate metrics
        if len(trades) == 0:
            return None
        
        final_bankroll = current_bankroll
        total_return = (final_bankroll - initial_bankroll) / initial_bankroll
        
        # Calculate Sharpe ratio (simplified)
        returns = [t['profit'] for t in trades if 'profit' in t]
        if returns:
            sharpe = np.mean(returns) / (np.std(returns) + 1e-6) if np.std(returns) > 0 else 0
        else:
            sharpe = 0
        
        # Calculate max drawdown
        bankrolls = [initial_bankroll]
        for trade in trades:
            if 'bankroll' in trade:
                bankrolls.append(trade['bankroll'])
        
        if len(bankrolls) > 1:
            peak = np.maximum.accumulate(bankrolls)
            drawdown = (peak - bankrolls) / peak
            max_drawdown = np.max(drawdown)
        else:
            max_drawdown = 0
        
        # Estimate probability of ruin (simplified)
        prob_ruin = max(0, min(1, max_drawdown * 2))  # Rough heuristic
        
        return {
            'cash_threshold': cash_threshold,
            'sidebet_threshold': sidebet_threshold,
            'total_return': total_return,
            'sharpe_ratio': sharpe,
            'max_drawdown': max_drawdown,
            'prob_ruin': prob_ruin,
            'trades_count': len(trades),
            'final_bankroll': final_bankroll
        }
    
    def find_pareto_optimal(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Find Pareto-optimal threshold combinations"""
        if not results:
            return []
        
        pareto = []
        for result in results:
            dominated = False
            for other in results:
                if (other['total_return'] >= result['total_return'] and
                    other['sharpe_ratio'] >= result['sharpe_ratio'] and
                    other['max_drawdown'] <= result['max_drawdown'] and
                    (other['total_return'] > result['total_return'] or
                     other['sharpe_ratio'] > result['sharpe_ratio'] or
                     other['max_drawdown'] < result['max_drawdown'])):
                    dominated = True
                    break
            
            if not dominated:
                pareto.append(result)
        
        # Sort by Sharpe ratio (descending)
        pareto.sort(key=lambda x: x['sharpe_ratio'], reverse=True)
        return pareto
    
    def run_threshold_sweep(self) -> None:
        """Run the complete threshold sweep"""
        print("Loading data...")
        rounds_df, ticks_df = self.load_data()
        
        print("Engineering features...")
        features_df = self.engineer_features(rounds_df, ticks_df)
        
        print(f"Running threshold sweep...")
        print(f"Cash thresholds: {len(self.cash_thresholds)} values")
        print(f"Sidebet thresholds: {len(self.sidebet_thresholds)} values")
        print(f"Total combinations: {len(self.cash_thresholds) * len(self.sidebet_thresholds)}")
        
        # Sweep through all combinations
        for cash_thresh in self.cash_thresholds:
            for sidebet_thresh in self.sidebet_thresholds:
                print(f"Testing: cash={cash_thresh:.2f}, sidebet={sidebet_thresh:.2f}")
                
                result = self.simulate_with_thresholds(
                    features_df, cash_thresh, sidebet_thresh
                )
                
                if result:
                    self.results.append(result)
        
        print(f"Completed sweep with {len(self.results)} valid results")
        
        # Find Pareto-optimal solutions
        self.pareto_optimal = self.find_pareto_optimal(self.results)
        print(f"Found {len(self.pareto_optimal)} Pareto-optimal solutions")
    
    def save_results(self) -> None:
        """Save results to files"""
        # Save all results
        results_file = "data/threshold_sweep_results.json"
        os.makedirs(os.path.dirname(results_file), exist_ok=True)
        
        with open(results_file, 'w') as f:
            json.dump({
                'sweep_timestamp': datetime.now().isoformat(),
                'total_combinations': len(self.cash_thresholds) * len(self.sidebet_thresholds),
                'valid_results': len(self.results),
                'pareto_optimal_count': len(self.pareto_optimal),
                'results': self.results,
                'pareto_optimal': self.pareto_optimal
            }, f, indent=2)
        
        print(f"Saved complete results to {results_file}")
        
        # Save recommended thresholds
        if self.pareto_optimal:
            best = self.pareto_optimal[0]  # Best Sharpe ratio
            
            thresholds = {
                "cash_if_p5_gt": round(best['cash_threshold'], 3),
                "sidebet_if_p10_gt": round(best['sidebet_threshold'], 3),
                "min_confidence": 0.55,
                "regime": "default",
                "trained_at": datetime.now().isoformat(),
                "rounds_used": len(self.results),
                "metrics": {
                    "total_return": round(best['total_return'], 4),
                    "sharpe_ratio": round(best['sharpe_ratio'], 4),
                    "max_drawdown": round(best['max_drawdown'], 4),
                    "prob_ruin": round(best['prob_ruin'], 4)
                }
            }
            
            thresholds_file = "data/thresholds.json"
            with open(thresholds_file, 'w') as f:
                json.dump(thresholds, f, indent=2)
            
            print(f"Saved recommended thresholds to {thresholds_file}")
    
    def print_summary(self) -> None:
        """Print summary of results"""
        if not self.pareto_optimal:
            print("No Pareto-optimal solutions found")
            return
        
        print("\n" + "="*80)
        print("THRESHOLD TUNING RESULTS")
        print("="*80)
        
        print(f"\nTop 5 Pareto-optimal solutions (sorted by Sharpe ratio):")
        print(f"{'Cash':<8} {'Sidebet':<10} {'Return':<8} {'Sharpe':<8} {'MDD':<8} {'Ruin':<8}")
        print("-" * 60)
        
        for i, result in enumerate(self.pareto_optimal[:5]):
            print(f"{result['cash_threshold']:<8.2f} "
                  f"{result['sidebet_threshold']:<10.2f} "
                  f"{result['total_return']:<8.3f} "
                  f"{result['sharpe_ratio']:<8.3f} "
                  f"{result['max_drawdown']:<8.3f} "
                  f"{result['prob_ruin']:<8.3f}")
        
        print(f"\nRecommended thresholds:")
        best = self.pareto_optimal[0]
        print(f"  Cash threshold: p_rug_5s > {best['cash_threshold']:.2f}")
        print(f"  Sidebet threshold: p_rug_10s > {best['sidebet_threshold']:.2f}")
        print(f"  Expected return: {best['total_return']:.2%}")
        print(f"  Sharpe ratio: {best['sharpe_ratio']:.3f}")
        print(f"  Max drawdown: {best['max_drawdown']:.2%}")
        print(f"  Probability of ruin: {best['prob_ruin']:.2%}")

def main():
    """Main execution function"""
    print("🎯 Threshold Tuning for Rugs Research")
    print("=" * 50)
    
    try:
        tuner = ThresholdTuner()
        tuner.run_threshold_sweep()
        tuner.save_results()
        tuner.print_summary()
        
        print("\n✅ Threshold tuning completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Threshold tuning failed: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
