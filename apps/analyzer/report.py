#!/usr/bin/env python3
"""
Strategy Evaluation Reports for Rugs Research
Generates equity curves and risk metrics from simulation results
"""

import json
import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
from datetime import datetime
from typing import Dict, List, Any, Optional
import argparse

class StrategyReporter:
    def __init__(self, results_path: str = "../data/sim_results.json"):
        """
        Initialize strategy reporter
        
        Args:
            results_path: Path to simulation results JSON file
        """
        self.results_path = results_path
        self.results = self._load_results()
    
    def _load_results(self) -> Dict[str, Any]:
        """Load simulation results from JSON file"""
        if not os.path.exists(self.results_path):
            print(f"❌ Results file not found: {self.results_path}")
            return {}
        
        try:
            with open(self.results_path, 'r') as f:
                results = json.load(f)
            print(f"✓ Loaded results for {len(results)} strategies")
            return results
        except Exception as e:
            print(f"❌ Error loading results: {e}")
            return {}
    
    def generate_summary_table(self) -> pd.DataFrame:
        """Generate summary table of all strategies"""
        if not self.results:
            return pd.DataFrame()
        
        summary_data = []
        for strategy_name, result in self.results.items():
            summary_data.append({
                'Strategy': strategy_name,
                'Total Return (%)': result['total_return_pct'],
                'Final Balance': result['final_balance'],
                'Win Rate (%)': result['win_rate_pct'],
                'Total Trades': result['total_trades'],
                'Max Drawdown (%)': result['max_drawdown_pct'],
                'Sharpe Ratio': result['sharpe_ratio'],
                'Volatility (%)': result['volatility_pct'],
                'Risk-Adjusted Return': result['sharpe_ratio'] * result['total_return_pct'] / 100
            })
        
        df = pd.DataFrame(summary_data)
        df = df.sort_values('Risk-Adjusted Return', ascending=False)
        
        return df
    
    def calculate_risk_metrics(self, equity_curve: List[float]) -> Dict[str, float]:
        """Calculate comprehensive risk metrics for an equity curve"""
        if len(equity_curve) < 2:
            return {}
        
        equity_array = np.array(equity_curve)
        returns = np.diff(equity_array) / equity_array[:-1]
        
        # Basic metrics
        total_return = (equity_array[-1] - equity_array[0]) / equity_array[0]
        annualized_return = total_return * (252 / len(returns)) if len(returns) > 0 else 0
        
        # Risk metrics
        volatility = np.std(returns) * np.sqrt(252) if len(returns) > 0 else 0
        sharpe_ratio = annualized_return / volatility if volatility > 0 else 0
        
        # Drawdown metrics
        peak = equity_array[0]
        max_dd = 0
        current_dd = 0
        dd_duration = 0
        max_dd_duration = 0
        
        for value in equity_array:
            if value > peak:
                peak = value
                current_dd = 0
            else:
                current_dd += 1
                dd = (peak - value) / peak
                if dd > max_dd:
                    max_dd = dd
                    max_dd_duration = current_dd
        
        # Sortino ratio (using downside deviation)
        downside_returns = returns[returns < 0]
        downside_deviation = np.std(downside_returns) * np.sqrt(252) if len(downside_returns) > 0 else 0
        sortino_ratio = annualized_return / downside_deviation if downside_deviation > 0 else 0
        
        # Calmar ratio (annualized return / max drawdown)
        calmar_ratio = annualized_return / max_dd if max_dd > 0 else 0
        
        return {
            'total_return': total_return * 100,
            'annualized_return': annualized_return * 100,
            'volatility': volatility * 100,
            'sharpe_ratio': sharpe_ratio,
            'sortino_ratio': sortino_ratio,
            'calmar_ratio': calmar_ratio,
            'max_drawdown': max_dd * 100,
            'max_drawdown_duration': max_dd_duration,
            'var_95': np.percentile(returns, 5) * 100,  # 95% VaR
            'cvar_95': np.mean(returns[returns <= np.percentile(returns, 5)]) * 100 if len(returns) > 0 else 0
        }
    
    def generate_equity_curves_plot(self, output_path: str = "../data/exports/strategy_equity.png"):
        """Generate equity curves plot for all strategies"""
        if not self.results:
            print("No results to plot")
            return
        
        plt.figure(figsize=(12, 8))
        
        # Plot equity curves
        for strategy_name, result in self.results.items():
            equity_curve = result['equity_curve']
            if len(equity_curve) > 0:
                plt.plot(equity_curve, label=strategy_name, linewidth=2)
        
        plt.xlabel('Trade Number')
        plt.ylabel('Portfolio Value ($)')
        plt.title('Strategy Equity Curves')
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.yscale('log')  # Log scale for better visualization
        
        # Add annotations
        for strategy_name, result in self.results.items():
            if len(result['equity_curve']) > 0:
                final_value = result['equity_curve'][-1]
                plt.annotate(f"{result['total_return_pct']:.1f}%", 
                           xy=(len(result['equity_curve'])-1, final_value),
                           xytext=(10, 10), textcoords='offset points',
                           fontsize=8, alpha=0.7)
        
        plt.tight_layout()
        
        # Save plot
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        plt.close()
        
        print(f"✓ Equity curves saved to {output_path}")
    
    def generate_drawdown_plot(self, output_path: str = "../data/exports/strategy_drawdown.png"):
        """Generate drawdown plot for all strategies"""
        if not self.results:
            print("No results to plot")
            return
        
        plt.figure(figsize=(12, 6))
        
        for strategy_name, result in self.results.items():
            equity_curve = np.array(result['equity_curve'])
            if len(equity_curve) > 0:
                # Calculate drawdown
                peak = np.maximum.accumulate(equity_curve)
                drawdown = (peak - equity_curve) / peak * 100
                
                plt.plot(drawdown, label=strategy_name, linewidth=2)
        
        plt.xlabel('Trade Number')
        plt.ylabel('Drawdown (%)')
        plt.title('Strategy Drawdowns')
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.axhline(y=0, color='black', linestyle='-', alpha=0.3)
        
        plt.tight_layout()
        
        # Save plot
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        plt.close()
        
        print(f"✓ Drawdown plot saved to {output_path}")
    
    def generate_risk_return_scatter(self, output_path: str = "../data/exports/risk_return_scatter.png"):
        """Generate risk-return scatter plot"""
        if not self.results:
            print("No results to plot")
            return
        
        # Calculate risk metrics for all strategies
        risk_data = []
        for strategy_name, result in self.results.items():
            metrics = self.calculate_risk_metrics(result['equity_curve'])
            if metrics:
                risk_data.append({
                    'strategy': strategy_name,
                    'return': metrics['total_return'],
                    'volatility': metrics['volatility'],
                    'sharpe': metrics['sharpe_ratio'],
                    'max_dd': metrics['max_drawdown']
                })
        
        if not risk_data:
            print("No valid risk data to plot")
            return
        
        df = pd.DataFrame(risk_data)
        
        # Create scatter plot
        plt.figure(figsize=(10, 8))
        
        # Color by Sharpe ratio
        scatter = plt.scatter(df['volatility'], df['return'], 
                            c=df['sharpe'], s=100, alpha=0.7, cmap='viridis')
        
        # Add strategy labels
        for _, row in df.iterrows():
            plt.annotate(row['strategy'], 
                        xy=(row['volatility'], row['return']),
                        xytext=(5, 5), textcoords='offset points',
                        fontsize=8, alpha=0.8)
        
        plt.xlabel('Volatility (%)')
        plt.ylabel('Total Return (%)')
        plt.title('Risk-Return Profile of Strategies')
        plt.colorbar(scatter, label='Sharpe Ratio')
        plt.grid(True, alpha=0.3)
        
        # Add efficient frontier line (simplified)
        if len(df) > 1:
            # Sort by return and connect points
            df_sorted = df.sort_values('return')
            plt.plot(df_sorted['volatility'], df_sorted['return'], 
                    'k--', alpha=0.5, linewidth=1)
        
        plt.tight_layout()
        
        # Save plot
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        plt.close()
        
        print(f"✓ Risk-return scatter saved to {output_path}")
    
    def print_detailed_report(self):
        """Print detailed strategy report"""
        if not self.results:
            print("No results to report")
            return
        
        print("\n" + "="*120)
        print("STRATEGY EVALUATION REPORT")
        print("="*120)
        print(f"Report Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print(f"Strategies Analyzed: {len(self.results)}")
        
        # Summary table
        summary_df = self.generate_summary_table()
        if not summary_df.empty:
            print("\n" + "-"*120)
            print("SUMMARY TABLE (Ranked by Risk-Adjusted Return)")
            print("-"*120)
            print(summary_df.to_string(index=False, float_format='%.2f'))
        
        # Detailed risk metrics
        print("\n" + "-"*120)
        print("DETAILED RISK METRICS")
        print("-"*120)
        
        for strategy_name, result in self.results.items():
            metrics = self.calculate_risk_metrics(result['equity_curve'])
            if metrics:
                print(f"\n{strategy_name.upper()}:")
                print(f"  Total Return:           {metrics['total_return']:.2f}%")
                print(f"  Annualized Return:      {metrics['annualized_return']:.2f}%")
                print(f"  Volatility:             {metrics['volatility']:.2f}%")
                print(f"  Sharpe Ratio:           {metrics['sharpe_ratio']:.3f}")
                print(f"  Sortino Ratio:          {metrics['sortino_ratio']:.3f}")
                print(f"  Calmar Ratio:           {metrics['calmar_ratio']:.3f}")
                print(f"  Max Drawdown:           {metrics['max_drawdown']:.2f}%")
                print(f"  Max Drawdown Duration:  {metrics['max_drawdown_duration']} trades")
                print(f"  95% VaR:                {metrics['var_95']:.2f}%")
                print(f"  95% CVaR:               {metrics['cvar_95']:.2f}%")
        
        # Strategy rankings
        print("\n" + "-"*120)
        print("STRATEGY RANKINGS")
        print("-"*120)
        
        rankings = []
        for strategy_name, result in self.results.items():
            metrics = self.calculate_risk_metrics(result['equity_curve'])
            if metrics:
                rankings.append({
                    'strategy': strategy_name,
                    'total_return': metrics['total_return'],
                    'sharpe_ratio': metrics['sharpe_ratio'],
                    'max_drawdown': metrics['max_drawdown'],
                    'risk_adjusted_return': metrics['sharpe_ratio'] * metrics['total_return'] / 100
                })
        
        if rankings:
            rankings.sort(key=lambda x: x['risk_adjusted_return'], reverse=True)
            
            print(f"{'Rank':<4} {'Strategy':<20} {'Return (%)':<12} {'Sharpe':<8} {'Max DD (%)':<12} {'Risk-Adj Return':<15}")
            print("-" * 80)
            
            for i, rank in enumerate(rankings, 1):
                print(f"{i:<4} {rank['strategy']:<20} {rank['total_return']:<12.2f} "
                      f"{rank['sharpe_ratio']:<8.3f} {rank['max_drawdown']:<12.2f} "
                      f"{rank['risk_adjusted_return']:<15.3f}")
        
        print("\n" + "="*120)
    
    def generate_all_reports(self, output_dir: str = "../data/exports"):
        """Generate all reports and plots"""
        print("Generating strategy evaluation reports...")
        
        # Create output directory
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate plots
        self.generate_equity_curves_plot(f"{output_dir}/strategy_equity.png")
        self.generate_drawdown_plot(f"{output_dir}/strategy_drawdown.png")
        self.generate_risk_return_scatter(f"{output_dir}/risk_return_scatter.png")
        
        # Print report
        self.print_detailed_report()
        
        print("✓ All reports generated successfully")

def main():
    """Main report generation function"""
    parser = argparse.ArgumentParser(description='Generate strategy evaluation reports')
    parser.add_argument('--results-path', default='../data/sim_results.json',
                       help='Path to simulation results JSON file')
    parser.add_argument('--output-dir', default='../data/exports',
                       help='Output directory for plots')
    parser.add_argument('--plots-only', action='store_true',
                       help='Generate only plots, skip text report')
    
    args = parser.parse_args()
    
    # Create reporter
    reporter = StrategyReporter(results_path=args.results_path)
    
    if args.plots_only:
        # Generate only plots
        reporter.generate_equity_curves_plot(f"{args.output_dir}/strategy_equity.png")
        reporter.generate_drawdown_plot(f"{args.output_dir}/strategy_drawdown.png")
        reporter.generate_risk_return_scatter(f"{args.output_dir}/risk_return_scatter.png")
        print("✓ Plots generated successfully")
    else:
        # Generate all reports
        reporter.generate_all_reports(args.output_dir)

if __name__ == "__main__":
    main()
