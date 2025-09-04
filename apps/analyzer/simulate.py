#!/usr/bin/env python3
"""
Risk Simulation CLI for Rugs Research
Simulates different betting strategies on historical data
"""

import json
import os
import sqlite3
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Dict, List, Any, Optional
import argparse

# Import bankroll manager
from strategy.bankroll import create_bankroll_manager

class StrategySimulator:
    def __init__(self, db_path: str = "../data/rugs.sqlite", 
                 model_path: str = "../data/model.json",
                 initial_balance: float = 1000.0):
        """
        Initialize strategy simulator
        
        Args:
            db_path: Path to SQLite database
            model_path: Path to trained model
            initial_balance: Starting bankroll for simulation
        """
        self.db_path = db_path
        self.model_path = model_path
        self.initial_balance = initial_balance
        
        # Load data
        self.rounds_df, self.ticks_df = self._load_data()
        self.model = self._load_model()
        
        # Simulation results
        self.results = {}
    
    def _load_data(self) -> tuple:
        """Load rounds and ticks data from SQLite"""
        if not os.path.exists(self.db_path):
            print(f"❌ Database not found: {self.db_path}")
            return pd.DataFrame(), pd.DataFrame()
        
        try:
            conn = sqlite3.connect(self.db_path)
            
            # Load rounds
            rounds_df = pd.read_sql_query("""
                SELECT * FROM rounds 
                WHERE ended_at IS NOT NULL 
                ORDER BY started_at
            """, conn)
            
            # Load ticks
            ticks_df = pd.read_sql_query("""
                SELECT * FROM ticks 
                ORDER BY ts
            """, conn)
            
            conn.close()
            
            print(f"✓ Loaded {len(rounds_df)} rounds and {len(ticks_df)} ticks")
            return rounds_df, ticks_df
            
        except Exception as e:
            print(f"❌ Error loading data: {e}")
            return pd.DataFrame(), pd.DataFrame()
    
    def _load_model(self) -> Optional[Dict]:
        """Load trained model"""
        if not os.path.exists(self.model_path):
            print(f"⚠️  Model not found: {self.model_path}")
            return None
        
        try:
            with open(self.model_path, 'r') as f:
                model = json.load(f)
            print(f"✓ Loaded model trained on {model.get('rounds_count', 'unknown')} rounds")
            return model
        except Exception as e:
            print(f"❌ Error loading model: {e}")
            return None
    
    def _calculate_features(self, tick_data: pd.Series, round_start_time: int) -> Dict[str, float]:
        """Calculate features for a tick"""
        time_since_start = (tick_data['ts'] - round_start_time) / 1000.0  # seconds
        
        # Simple feature calculation (in real implementation, you'd use more sophisticated methods)
        return {
            'x': tick_data.get('x', 1.0),
            't': time_since_start,
            'slope': 0.1,  # Placeholder
            'vol': 0.05,   # Placeholder
            'players': tick_data.get('players', 1000),
            'wager': tick_data.get('totalWager', 5000.0)
        }
    
    def _get_prediction(self, features: Dict[str, float]) -> Dict[str, float]:
        """Get model prediction for features"""
        if not self.model:
            # Return dummy predictions if no model
            return {'p_rug_5s': 0.1, 'p_rug_10s': 0.2}
        
        # In a real implementation, you'd load the actual model and make predictions
        # For now, return dummy predictions based on features
        x = features['x']
        t = features['t']
        
        # Simple heuristic: higher multiplier and longer time = higher rug probability
        p_rug_5s = min(0.8, 0.1 + (x - 1.0) * 0.1 + (t / 60.0) * 0.2)
        p_rug_10s = min(0.9, p_rug_5s + 0.1)
        
        return {'p_rug_5s': p_rug_5s, 'p_rug_10s': p_rug_10s}
    
    def simulate_naive_strategy(self, cashout_multiplier: float = 2.0) -> Dict[str, Any]:
        """Simulate naive strategy: always hold to target multiplier"""
        print(f"Simulating Naive Strategy (cashout at {cashout_multiplier}x)...")
        
        bm = create_bankroll_manager(initial_balance=self.initial_balance)
        equity_curve = [self.initial_balance]
        trades = []
        
        for _, round_data in self.rounds_df.iterrows():
            if pd.isna(round_data['rug_x']):
                continue  # Skip incomplete rounds
            
            # Simulate holding to target multiplier
            target_reached = round_data['rug_x'] >= cashout_multiplier
            
            if target_reached:
                # Win: profit = bet_amount * (cashout_multiplier - 1)
                bet_amount = bm.state['balance'] * 0.1  # 10% of balance
                profit = bet_amount * (cashout_multiplier - 1)
                result = bm.update_balance(bet_amount, profit)
                trades.append({
                    'round_id': round_data['id'],
                    'strategy': 'naive',
                    'bet_amount': bet_amount,
                    'result': profit,
                    'balance': result['new_balance']
                })
            else:
                # Loss: lose bet amount
                bet_amount = bm.state['balance'] * 0.1
                result = bm.update_balance(bet_amount, -bet_amount)
                trades.append({
                    'round_id': round_data['id'],
                    'strategy': 'naive',
                    'bet_amount': bet_amount,
                    'result': -bet_amount,
                    'balance': result['new_balance']
                })
            
            equity_curve.append(result['new_balance'])
        
        return self._calculate_strategy_metrics('naive', equity_curve, trades, bm)
    
    def simulate_model_guided_strategy(self, 
                                     cashout_threshold: float = 0.3,
                                     sidebet_threshold: float = 0.4) -> Dict[str, Any]:
        """Simulate model-guided strategy based on predicted rug probability"""
        print(f"Simulating Model-Guided Strategy (cashout at {cashout_threshold}, sidebet at {sidebet_threshold})...")
        
        bm = create_bankroll_manager(initial_balance=self.initial_balance)
        equity_curve = [self.initial_balance]
        trades = []
        
        for _, round_data in self.rounds_df.iterrows():
            if pd.isna(round_data['rug_x']):
                continue
            
            # Get ticks for this round
            round_ticks = self.ticks_df[self.ticks_df['round_id'] == round_data['id']]
            if len(round_ticks) == 0:
                continue
            
            # Simulate decision making based on model predictions
            action_taken = False
            
            for _, tick in round_ticks.iterrows():
                if tick['phase'] != 'live':
                    continue
                
                features = self._calculate_features(tick, round_data['started_at'])
                prediction = self._get_prediction(features)
                
                # Decision logic
                if prediction['p_rug_5s'] > cashout_threshold:
                    # Cash out early
                    bet_amount = bm.state['balance'] * 0.1
                    current_multiplier = features['x']
                    if current_multiplier > 1.0:
                        profit = bet_amount * (current_multiplier - 1)
                        result = bm.update_balance(bet_amount, profit)
                        trades.append({
                            'round_id': round_data['id'],
                            'strategy': 'model_guided',
                            'action': 'cashout',
                            'multiplier': current_multiplier,
                            'bet_amount': bet_amount,
                            'result': profit,
                            'balance': result['new_balance']
                        })
                    action_taken = True
                    break
                
                elif prediction['p_rug_10s'] > sidebet_threshold:
                    # Arm sidebet (reduce position)
                    bet_amount = bm.state['balance'] * 0.05  # Smaller bet
                    current_multiplier = features['x']
                    if current_multiplier > 1.0:
                        profit = bet_amount * (current_multiplier - 1)
                        result = bm.update_balance(bet_amount, profit)
                        trades.append({
                            'round_id': round_data['id'],
                            'strategy': 'model_guided',
                            'action': 'sidebet',
                            'multiplier': current_multiplier,
                            'bet_amount': bet_amount,
                            'result': profit,
                            'balance': result['new_balance']
                        })
                    action_taken = True
                    break
            
            # If no action taken, hold to rug or 2x
            if not action_taken:
                bet_amount = bm.state['balance'] * 0.1
                if round_data['rug_x'] >= 2.0:
                    profit = bet_amount * (2.0 - 1)
                    result = bm.update_balance(bet_amount, profit)
                    trades.append({
                        'round_id': round_data['id'],
                        'strategy': 'model_guided',
                        'action': 'hold_to_2x',
                        'multiplier': 2.0,
                        'bet_amount': bet_amount,
                        'result': profit,
                        'balance': result['new_balance']
                    })
                else:
                    result = bm.update_balance(bet_amount, -bet_amount)
                    trades.append({
                        'round_id': round_data['id'],
                        'strategy': 'model_guided',
                        'action': 'rugged',
                        'multiplier': round_data['rug_x'],
                        'bet_amount': bet_amount,
                        'result': -bet_amount,
                        'balance': result['new_balance']
                    })
            
            equity_curve.append(bm.state['balance'])
        
        return self._calculate_strategy_metrics('model_guided', equity_curve, trades, bm)
    
    def simulate_random_strategy(self, bet_probability: float = 0.5) -> Dict[str, Any]:
        """Simulate random strategy as baseline"""
        print(f"Simulating Random Strategy (bet probability: {bet_probability})...")
        
        bm = create_bankroll_manager(initial_balance=self.initial_balance)
        equity_curve = [self.initial_balance]
        trades = []
        
        for _, round_data in self.rounds_df.iterrows():
            if pd.isna(round_data['rug_x']):
                continue
            
            # Randomly decide whether to bet
            if np.random.random() < bet_probability:
                bet_amount = bm.state['balance'] * 0.1
                
                # Randomly decide when to cash out (between 1.5x and 3x)
                target_multiplier = np.random.uniform(1.5, 3.0)
                
                if round_data['rug_x'] >= target_multiplier:
                    profit = bet_amount * (target_multiplier - 1)
                    result = bm.update_balance(bet_amount, profit)
                    trades.append({
                        'round_id': round_data['id'],
                        'strategy': 'random',
                        'target_multiplier': target_multiplier,
                        'bet_amount': bet_amount,
                        'result': profit,
                        'balance': result['new_balance']
                    })
                else:
                    result = bm.update_balance(bet_amount, -bet_amount)
                    trades.append({
                        'round_id': round_data['id'],
                        'strategy': 'random',
                        'target_multiplier': target_multiplier,
                        'bet_amount': bet_amount,
                        'result': -bet_amount,
                        'balance': result['new_balance']
                    })
                
                equity_curve.append(result['new_balance'])
            else:
                # Skip this round
                equity_curve.append(bm.state['balance'])
        
        return self._calculate_strategy_metrics('random', equity_curve, trades, bm)
    
    def _calculate_strategy_metrics(self, strategy_name: str, equity_curve: List[float], 
                                  trades: List[Dict], bm) -> Dict[str, Any]:
        """Calculate performance metrics for a strategy"""
        if len(equity_curve) == 0:
            return {}
        
        equity_array = np.array(equity_curve)
        returns = np.diff(equity_array) / equity_array[:-1]
        
        # Basic metrics
        total_return = (equity_array[-1] - equity_array[0]) / equity_array[0] * 100
        final_balance = equity_array[-1]
        
        # Risk metrics
        volatility = np.std(returns) * np.sqrt(len(returns)) if len(returns) > 0 else 0
        max_drawdown = self._calculate_max_drawdown(equity_array)
        
        # Trade metrics
        winning_trades = [t for t in trades if t['result'] > 0]
        losing_trades = [t for t in trades if t['result'] <= 0]
        win_rate = len(winning_trades) / len(trades) * 100 if trades else 0
        
        # Sharpe ratio (simplified)
        sharpe_ratio = np.mean(returns) / np.std(returns) if np.std(returns) > 0 else 0
        
        return {
            'strategy_name': strategy_name,
            'initial_balance': equity_array[0],
            'final_balance': final_balance,
            'total_return_pct': total_return,
            'total_trades': len(trades),
            'winning_trades': len(winning_trades),
            'losing_trades': len(losing_trades),
            'win_rate_pct': win_rate,
            'volatility_pct': volatility * 100,
            'max_drawdown_pct': max_drawdown * 100,
            'sharpe_ratio': sharpe_ratio,
            'equity_curve': equity_curve,
            'trades': trades,
            'simulation_date': datetime.now().isoformat()
        }
    
    def _calculate_max_drawdown(self, equity_curve: np.ndarray) -> float:
        """Calculate maximum drawdown"""
        peak = equity_curve[0]
        max_dd = 0
        
        for value in equity_curve:
            if value > peak:
                peak = value
            dd = (peak - value) / peak
            max_dd = max(max_dd, dd)
        
        return max_dd
    
    def run_simulations(self) -> Dict[str, Any]:
        """Run all strategy simulations"""
        print("Starting strategy simulations...")
        
        # Run different strategies
        strategies = {
            'naive_2x': self.simulate_naive_strategy(cashout_multiplier=2.0),
            'naive_1.5x': self.simulate_naive_strategy(cashout_multiplier=1.5),
            'model_conservative': self.simulate_model_guided_strategy(cashout_threshold=0.25, sidebet_threshold=0.35),
            'model_aggressive': self.simulate_model_guided_strategy(cashout_threshold=0.35, sidebet_threshold=0.45),
            'random_50pct': self.simulate_random_strategy(bet_probability=0.5),
            'random_25pct': self.simulate_random_strategy(bet_probability=0.25)
        }
        
        # Filter out empty results
        self.results = {k: v for k, v in strategies.items() if v}
        
        return self.results
    
    def save_results(self, output_path: str = "../data/sim_results.json"):
        """Save simulation results to file"""
        try:
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, 'w') as f:
                json.dump(self.results, f, indent=2)
            print(f"✓ Results saved to {output_path}")
        except Exception as e:
            print(f"❌ Error saving results: {e}")
    
    def print_summary(self):
        """Print summary of all strategies"""
        if not self.results:
            print("No simulation results to display")
            return
        
        print("\n" + "="*100)
        print("STRATEGY SIMULATION RESULTS")
        print("="*100)
        
        # Create summary table
        summary_data = []
        for strategy_name, result in self.results.items():
            summary_data.append({
                'Strategy': strategy_name,
                'Total Return (%)': f"{result['total_return_pct']:.1f}",
                'Final Balance': f"${result['final_balance']:.0f}",
                'Win Rate (%)': f"{result['win_rate_pct']:.1f}",
                'Total Trades': result['total_trades'],
                'Max Drawdown (%)': f"{result['max_drawdown_pct']:.1f}",
                'Sharpe Ratio': f"{result['sharpe_ratio']:.2f}",
                'Volatility (%)': f"{result['volatility_pct']:.1f}"
            })
        
        # Sort by total return
        summary_data.sort(key=lambda x: float(x['Total Return (%)']), reverse=True)
        
        # Print table
        headers = list(summary_data[0].keys())
        col_widths = [max(len(str(row[col])) for row in summary_data) for col in headers]
        col_widths = [max(width, len(header)) for width, header in zip(col_widths, headers)]
        
        # Header
        header_row = " | ".join(header.ljust(width) for header, width in zip(headers, col_widths))
        print(header_row)
        print("-" * len(header_row))
        
        # Data rows
        for row in summary_data:
            data_row = " | ".join(str(row[col]).ljust(width) for col, width in zip(headers, col_widths))
            print(data_row)
        
        print("\n" + "="*100)

def main():
    """Main simulation function"""
    parser = argparse.ArgumentParser(description='Simulate betting strategies')
    parser.add_argument('--db-path', default='../data/rugs.sqlite',
                       help='Path to SQLite database')
    parser.add_argument('--model-path', default='../data/model.json',
                       help='Path to trained model')
    parser.add_argument('--initial-balance', type=float, default=1000.0,
                       help='Initial bankroll for simulation')
    parser.add_argument('--output', default='../data/sim_results.json',
                       help='Output file for results')
    
    args = parser.parse_args()
    
    # Create simulator
    simulator = StrategySimulator(
        db_path=args.db_path,
        model_path=args.model_path,
        initial_balance=args.initial_balance
    )
    
    # Run simulations
    results = simulator.run_simulations()
    
    if results:
        # Save results
        simulator.save_results(args.output)
        
        # Print summary
        simulator.print_summary()
    else:
        print("❌ No simulation results generated")

if __name__ == "__main__":
    main()
