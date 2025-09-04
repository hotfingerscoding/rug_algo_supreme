#!/usr/bin/bin/env python3
"""
Rugs Research Dashboard
Live operations view with real-time data visualization
"""

import streamlit as st
import pandas as pd
import sqlite3
import json
import os
import requests
from datetime import datetime, timedelta
import matplotlib.pyplot as plt
import numpy as np
from typing import Optional, Dict, Any
import time

# Page configuration
st.set_page_config(
    page_title="Rugs Research Dashboard",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for better styling
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        font-weight: bold;
        color: #4ecdc4;
        text-align: center;
        margin-bottom: 2rem;
    }
    .metric-card {
        background-color: #f0f2f6;
        padding: 1rem;
        border-radius: 0.5rem;
        border-left: 4px solid #4ecdc4;
    }
    .status-online {
        color: #4ecdc4;
        font-weight: bold;
    }
    .status-offline {
        color: #ff6b6b;
        font-weight: bold;
    }
    .warning {
        color: #ffa502;
        font-weight: bold;
    }
</style>
""", unsafe_allow_html=True)

class DashboardData:
    def __init__(self):
        self.db_path = "../data/rugs.sqlite"
        self.model_path = "../models/current.json"
        self.bankroll_path = "../data/bankroll.json"
        self.sim_results_path = "../data/sim_results.json"
        self.api_url = "http://localhost:8000"
        
    def get_db_stats(self) -> Dict[str, Any]:
        """Get database statistics"""
        try:
            if not os.path.exists(self.db_path):
                return {"error": "Database not found"}
                
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Get table counts
            cursor.execute("SELECT COUNT(*) FROM rounds")
            rounds_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM ticks")
            ticks_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM events")
            events_count = cursor.fetchone()[0]
            
            # Get latest round
            cursor.execute("SELECT MAX(ended_at) FROM rounds WHERE ended_at IS NOT NULL")
            latest_round = cursor.fetchone()[0]
            
            # Get database size
            db_size = os.path.getsize(self.db_path) / (1024 * 1024)  # MB
            
            conn.close()
            
            return {
                "rounds": rounds_count,
                "ticks": ticks_count,
                "events": events_count,
                "latest_round": latest_round,
                "db_size_mb": round(db_size, 2)
            }
        except Exception as e:
            return {"error": str(e)}
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get current model information"""
        try:
            if os.path.exists(self.model_path):
                with open(self.model_path, 'r') as f:
                    model_data = json.load(f)
                
                return {
                    "loaded": True,
                    "version": os.path.basename(self.model_path),
                    "trained_at": model_data.get('trained_at', 'unknown'),
                    "rounds_count": model_data.get('rounds_count', 0)
                }
            else:
                return {"loaded": False, "error": "Model file not found"}
        except Exception as e:
            return {"loaded": False, "error": str(e)}
    
    def get_api_health(self) -> Dict[str, Any]:
        """Check API health"""
        try:
            response = requests.get(f"{self.api_url}/health", timeout=5)
            if response.status_code == 200:
                return {"online": True, "data": response.json()}
            else:
                return {"online": False, "error": f"HTTP {response.status_code}"}
        except requests.exceptions.RequestException as e:
            return {"online": False, "error": str(e)}
    
    def get_recent_rounds(self, limit: int = 20) -> pd.DataFrame:
        """Get recent rounds data"""
        try:
            if not os.path.exists(self.db_path):
                return pd.DataFrame()
                
            conn = sqlite3.connect(self.db_path)
            
            query = """
            SELECT 
                id,
                started_at,
                ended_at,
                max_x,
                rug_x,
                rug_time_s,
                players,
                total_wager,
                status
            FROM rounds 
            WHERE ended_at IS NOT NULL 
            ORDER BY ended_at DESC 
            LIMIT ?
            """
            
            df = pd.read_sql_query(query, conn, params=(limit,))
            conn.close()
            
            if not df.empty:
                # Convert timestamps
                df['started_at'] = pd.to_datetime(df['started_at'])
                df['ended_at'] = pd.to_datetime(df['ended_at'])
                df['duration'] = (df['ended_at'] - df['started_at']).dt.total_seconds()
                
                # Calculate some metrics
                df['rug_time_pct'] = (df['rug_time_s'] / df['duration'] * 100).round(1)
                
            return df
            
        except Exception as e:
            st.error(f"Error loading recent rounds: {e}")
            return pd.DataFrame()
    
    def get_distributions(self) -> Dict[str, Any]:
        """Get distribution data for visualizations"""
        try:
            if not os.path.exists(self.db_path):
                return {}
                
            conn = sqlite3.connect(self.db_path)
            
            # Rug time distribution
            rug_time_query = """
            SELECT rug_time_s FROM rounds 
            WHERE rug_time_s IS NOT NULL AND rug_time_s > 0
            """
            rug_time_df = pd.read_sql_query(rug_time_query, conn)
            
            # Rug multiplier distribution
            rug_x_query = """
            SELECT rug_x FROM rounds 
            WHERE rug_x IS NOT NULL AND rug_x > 0
            """
            rug_x_df = pd.read_sql_query(rug_x_query, conn)
            
            # Player count distribution
            players_query = """
            SELECT players FROM rounds 
            WHERE players IS NOT NULL AND players > 0
            """
            players_df = pd.read_sql_query(players_query, conn)
            
            conn.close()
            
            return {
                "rug_time": rug_time_df,
                "rug_x": rug_x_df,
                "players": players_df
            }
            
        except Exception as e:
            st.error(f"Error loading distributions: {e}")
            return {}
    
    def get_bankroll_status(self) -> Dict[str, Any]:
        """Get bankroll status"""
        try:
            if os.path.exists(self.bankroll_path):
                with open(self.bankroll_path, 'r') as f:
                    bankroll_data = json.load(f)
                
                return {
                    "loaded": True,
                    "balance": bankroll_data.get('balance', 0),
                    "daily_loss_pct": bankroll_data.get('daily_loss_pct', 0),
                    "can_bet": bankroll_data.get('can_bet', True),
                    "total_wins": bankroll_data.get('total_wins', 0),
                    "total_losses": bankroll_data.get('total_losses', 0)
                }
            else:
                return {"loaded": False, "error": "Bankroll file not found"}
        except Exception as e:
            return {"loaded": False, "error": str(e)}
    
    def get_simulation_results(self) -> Dict[str, Any]:
        """Get strategy simulation results"""
        try:
            if os.path.exists(self.sim_results_path):
                with open(self.sim_results_path, 'r') as f:
                    sim_data = json.load(f)
                
                return {
                    "loaded": True,
                    "data": sim_data
                }
            else:
                return {"loaded": False, "error": "Simulation results not found"}
        except Exception as e:
            return {"loaded": False, "error": str(e)}
    
    def get_thresholds(self) -> Dict[str, Any]:
        """Get current thresholds and regime information"""
        try:
            thresholds_path = "../data/thresholds.json"
            if not os.path.exists(thresholds_path):
                return None
            
            with open(thresholds_path, 'r') as f:
                thresholds = json.load(f)
            
            return thresholds
        except Exception as e:
            print(f"Error loading thresholds: {e}")
            return None

def create_histogram(data: pd.Series, title: str, xlabel: str, bins: int = 20):
    """Create a histogram plot"""
    if data.empty:
        st.warning(f"No data available for {title}")
        return
    
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.hist(data, bins=bins, alpha=0.7, color='#4ecdc4', edgecolor='black')
    ax.set_title(title)
    ax.set_xlabel(xlabel)
    ax.set_ylabel('Frequency')
    ax.grid(True, alpha=0.3)
    
    # Add statistics
    mean_val = data.mean()
    median_val = data.median()
    ax.axvline(mean_val, color='red', linestyle='--', label=f'Mean: {mean_val:.2f}')
    ax.axvline(median_val, color='orange', linestyle='--', label=f'Median: {median_val:.2f}')
    ax.legend()
    
    st.pyplot(fig)
    plt.close()

def create_equity_curves(sim_data: Dict[str, Any]):
    """Create equity curves plot"""
    if not sim_data.get('loaded'):
        st.warning("No simulation data available")
        return
    
    fig, ax = plt.subplots(figsize=(10, 6))
    
    for strategy_name, strategy_data in sim_data['data'].items():
        if 'equity_curve' in strategy_data:
            equity_curve = strategy_data['equity_curve']
            if len(equity_curve) > 1:
                x = range(len(equity_curve))
                ax.plot(x, equity_curve, label=strategy_name, linewidth=2)
    
    ax.set_title('Strategy Equity Curves')
    ax.set_xlabel('Trade Number')
    ax.set_ylabel('Portfolio Value ($)')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    st.pyplot(fig)
    plt.close()

def create_ev_surface():
    """Create EV surface plot showing decision boundaries"""
    try:
        # Create sample data for EV surface
        x_range = np.linspace(1.0, 5.0, 50)
        p5_range = np.linspace(0.0, 0.6, 50)
        X, Y = np.meshgrid(x_range, p5_range)
        
        # Calculate EV difference (cash_now - hold)
        # This is a simplified example - in practice, use actual EV calculations
        Z = np.zeros_like(X)
        for i in range(len(p5_range)):
            for j in range(len(x_range)):
                x = x_range[j]
                p5 = p5_range[i]
                
                # Simplified EV calculation
                ev_cash_now = x * 0.998  # After slippage
                ev_hold = (1 - p5) * x * 1.15 + p5 * 1.02  # Simplified hold EV
                Z[i, j] = ev_cash_now - ev_hold
        
        # Create the plot
        fig, ax = plt.subplots(figsize=(10, 6))
        
        # Create heatmap
        im = ax.contourf(X, Y, Z, levels=20, cmap='RdYlGn')
        
        # Add decision boundary (where EV difference = 0)
        contour = ax.contour(X, Y, Z, levels=[0], colors='black', linewidths=2)
        ax.clabel(contour, inline=True, fontsize=10, fmt='%.2f')
        
        # Customize plot
        ax.set_title('EV Surface: Cash Now vs Hold Decision Boundary')
        ax.set_xlabel('Current Multiplier (x)')
        ax.set_ylabel('Probability of Rug in 5s (p_rug_5s)')
        
        # Add colorbar
        cbar = plt.colorbar(im, ax=ax)
        cbar.set_label('EV(Cash Now) - EV(Hold)')
        
        # Add annotations
        ax.text(0.02, 0.98, 'Green: Hold is better\nRed: Cash now is better', 
                transform=ax.transAxes, verticalalignment='top',
                bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))
        
        st.pyplot(fig)
        plt.close()
        
    except Exception as e:
        st.error(f"Error creating EV surface: {e}")
        st.info("EV surface plot could not be generated")

def main():
    st.markdown('<h1 class="main-header">🎯 Rugs Research Dashboard</h1>', unsafe_allow_html=True)
    
    # Initialize data
    data = DashboardData()
    
    # Auto-refresh every 2 seconds
    if 'refresh_counter' not in st.session_state:
        st.session_state.refresh_counter = 0
    
    st.session_state.refresh_counter += 1
    
    # Sidebar
    st.sidebar.title("🔧 Dashboard Controls")
    
    # Auto-refresh toggle
    auto_refresh = st.sidebar.checkbox("Auto-refresh (2s)", value=True)
    
    if auto_refresh:
        st.sidebar.info("🔄 Auto-refreshing every 2 seconds")
        time.sleep(0.1)  # Small delay to allow refresh
        st.experimental_rerun()
    
    # Manual refresh button
    if st.sidebar.button("🔄 Manual Refresh"):
        st.experimental_rerun()
    
    # Main dashboard content
    col1, col2, col3, col4 = st.columns(4)
    
    # Live Status (Top Bar)
    with col1:
        st.subheader("📊 Database")
        db_stats = data.get_db_stats()
        
        if "error" not in db_stats:
            st.metric("Rounds", f"{db_stats['rounds']:,}")
            st.metric("Ticks", f"{db_stats['ticks']:,}")
            st.metric("DB Size", f"{db_stats['db_size_mb']} MB")
        else:
            st.error(f"DB Error: {db_stats['error']}")
    
    with col2:
        st.subheader("🤖 Model")
        model_info = data.get_model_info()
        
        if model_info.get('loaded'):
            st.metric("Status", "✅ Loaded")
            st.metric("Version", model_info['version'][:20] + "..." if len(model_info['version']) > 20 else model_info['version'])
            st.metric("Trained On", f"{model_info['rounds_count']:,} rounds")
        else:
            st.metric("Status", "❌ Not Loaded")
            st.error(f"Model Error: {model_info.get('error', 'Unknown')}")
    
    with col3:
        st.subheader("🌐 API")
        api_health = data.get_api_health()
        
        if api_health.get('online'):
            st.metric("Status", "🟢 Online", delta="Connected")
            if api_health.get('data'):
                api_data = api_health['data']
                st.metric("Model Loaded", "✅" if api_data.get('model_loaded') else "❌")
                st.metric("Last Round", api_data.get('database', {}).get('latest_round', 'N/A')[:10] if api_data.get('database', {}).get('latest_round') else 'N/A')
        else:
            st.metric("Status", "🔴 Offline", delta="Disconnected")
            st.error(f"API Error: {api_health.get('error', 'Unknown')}")
    
    with col4:
        st.subheader("💰 Bankroll")
        bankroll_status = data.get_bankroll_status()
        
        if bankroll_status.get('loaded'):
            st.metric("Balance", f"${bankroll_status['balance']:,.0f}")
            daily_loss = bankroll_status['daily_loss_pct']
            st.metric("Daily Loss", f"{daily_loss:.1f}%", 
                     delta="⚠️ Cap Hit" if daily_loss >= 20 else "✅ OK")
            st.metric("Can Bet", "✅ Yes" if bankroll_status['can_bet'] else "❌ No")
        else:
            st.metric("Status", "❌ Not Found")
            st.error(f"Bankroll Error: {bankroll_status.get('error', 'Unknown')}")
    
    # Now Playing Section
    st.markdown("---")
    st.subheader("🎮 Now Playing")
    
    recent_rounds = data.get_recent_rounds(limit=5)
    
    if not recent_rounds.empty:
        # Get the most recent round
        latest_round = recent_rounds.iloc[0]
        
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.metric("Current Round", f"#{latest_round['id']}")
            st.metric("Duration", f"{latest_round['duration']:.1f}s")
        
        with col2:
            st.metric("Max Multiplier", f"{latest_round['max_x']:.2f}x")
            st.metric("Rug Multiplier", f"{latest_round['rug_x']:.2f}x")
        
        with col3:
            st.metric("Players", f"{latest_round['players']:,}")
            st.metric("Total Wager", f"${latest_round['total_wager']:,.0f}")
        
        with col4:
            st.metric("Rug Time", f"{latest_round['rug_time_s']:.1f}s")
            st.metric("Rug %", f"{latest_round['rug_time_pct']:.1f}%")
        
        # Live prediction (if API is available)
        if api_health.get('online'):
            try:
                # Simulate prediction with current round data
                prediction_data = {
                    "x": latest_round['max_x'],
                    "t": latest_round['duration'],
                    "slope": 0.1,  # Placeholder
                    "vol": 0.05,   # Placeholder
                    "players": latest_round['players'],
                    "wager": latest_round['total_wager']
                }
                
                response = requests.post(f"{data.api_url}/predict", json=prediction_data, timeout=5)
                if response.status_code == 200:
                    prediction = response.json()
                    
                    st.markdown("**🎯 Live Prediction:**")
                    col1, col2 = st.columns(2)
                    with col1:
                        st.metric("5s Rug Risk", f"{prediction['p_rug_5s']*100:.1f}%")
                    with col2:
                        st.metric("10s Rug Risk", f"{prediction['p_rug_10s']*100:.1f}%")
                else:
                    st.info("API available but prediction failed")
            except:
                st.info("API available but prediction service error")
        else:
            st.info("API offline - predictions unavailable")
    else:
        st.warning("No recent rounds data available. Start the collector to see live data.")
    
    # Recent Rounds Table
    st.markdown("---")
    st.subheader("📋 Recent Rounds")
    
    if not recent_rounds.empty:
        # Format the dataframe for display
        display_df = recent_rounds.copy()
        display_df['started_at'] = display_df['started_at'].dt.strftime('%H:%M:%S')
        display_df['ended_at'] = display_df['ended_at'].dt.strftime('%H:%M:%S')
        display_df['duration'] = display_df['duration'].round(1)
        display_df['max_x'] = display_df['max_x'].round(2)
        display_df['rug_x'] = display_df['rug_x'].round(2)
        display_df['rug_time_s'] = display_df['rug_time_s'].round(1)
        display_df['rug_time_pct'] = display_df['rug_time_pct'].round(1)
        display_df['total_wager'] = display_df['total_wager'].apply(lambda x: f"${x:,.0f}")
        
        # Select columns to display
        display_columns = ['id', 'started_at', 'ended_at', 'duration', 'max_x', 'rug_x', 
                          'rug_time_s', 'rug_time_pct', 'players', 'total_wager', 'status']
        
        st.dataframe(display_df[display_columns], use_container_width=True)
        
        # Summary statistics
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.metric("Avg Duration", f"{recent_rounds['duration'].mean():.1f}s")
            st.metric("Avg Max X", f"{recent_rounds['max_x'].mean():.2f}x")
        
        with col2:
            st.metric("Avg Rug X", f"{recent_rounds['rug_x'].mean():.2f}x")
            st.metric("Avg Rug Time", f"{recent_rounds['rug_time_s'].mean():.1f}s")
        
        with col3:
            st.metric("Avg Players", f"{recent_rounds['players'].mean():,.0f}")
            st.metric("Avg Wager", f"${recent_rounds['total_wager'].mean():,.0f}")
        
        with col4:
            st.metric("Total Rounds", len(recent_rounds))
            st.metric("Success Rate", f"{(recent_rounds['status'] == 'completed').mean()*100:.1f}%")
    else:
        st.info("No rounds data available")
    
    # Distributions and Curves
    st.markdown("---")
    st.subheader("📊 Distributions & Curves")
    
    distributions = data.get_distributions()
    
    if distributions:
        col1, col2 = st.columns(2)
        
        with col1:
            if not distributions['rug_time'].empty:
                create_histogram(distributions['rug_time']['rug_time_s'], 
                               'Rug Time Distribution', 'Rug Time (seconds)', bins=30)
            else:
                st.info("No rug time data available")
        
        with col2:
            if not distributions['rug_x'].empty:
                create_histogram(distributions['rug_x']['rug_x'], 
                               'Rug Multiplier Distribution', 'Rug Multiplier (x)', bins=20)
            else:
                st.info("No rug multiplier data available")
        
        # Player distribution
        if not distributions['players'].empty:
            create_histogram(distributions['players']['players'], 
                           'Player Count Distribution', 'Number of Players', bins=25)
    else:
        st.info("No distribution data available")
    
    # Live EV & Actions Panel
    st.markdown("---")
    st.subheader("🎯 Live EV & Actions")
    
    # Get current thresholds and regime
    try:
        thresholds = data.get_thresholds()
        if thresholds:
            col1, col2, col3 = st.columns(3)
            
            with col1:
                st.metric("Cash Threshold", f"p_rug_5s > {thresholds.get('cash_if_p5_gt', 'N/A')}")
                st.metric("Sidebet Threshold", f"p_rug_10s > {thresholds.get('sidebet_if_p10_gt', 'N/A')}")
            
            with col2:
                regime = thresholds.get('regime', 'unknown')
                regime_color = {
                    'low_vol': '🟢',
                    'normal': '🟡', 
                    'high_vol': '🔴'
                }.get(regime, '⚪')
                st.metric("Active Regime", f"{regime_color} {regime.replace('_', ' ').title()}")
                st.metric("Min Confidence", f"{thresholds.get('min_confidence', 'N/A')}")
            
            with col3:
                if thresholds.get('metrics'):
                    metrics = thresholds['metrics']
                    st.metric("Expected Return", f"{metrics.get('total_return', 0):.2%}")
                    st.metric("Sharpe Ratio", f"{metrics.get('sharpe_ratio', 0):.3f}")
        else:
            st.info("No thresholds data available. Run 'make tune' to generate thresholds.")
    except Exception as e:
        st.error(f"Error loading thresholds: {e}")
    
    # EV Surface Plot
    try:
        create_ev_surface()
    except Exception as e:
        st.error(f"Error creating EV surface: {e}")
    
    # Strategy Panel
    st.markdown("---")
    st.subheader("📈 Strategy Performance")
    
    sim_results = data.get_simulation_results()
    
    if sim_results.get('loaded'):
        # Create equity curves
        create_equity_curves(sim_results)
        
        # Strategy summary table
        if sim_results['data']:
            strategy_summary = []
            for strategy_name, strategy_data in sim_results['data'].items():
                summary = {
                    'Strategy': strategy_name,
                    'Total Return (%)': strategy_data.get('total_return_pct', 0),
                    'Win Rate (%)': strategy_data.get('win_rate_pct', 0),
                    'Max Drawdown (%)': strategy_data.get('max_drawdown_pct', 0),
                    'Sharpe Ratio': strategy_data.get('sharpe_ratio', 0),
                    'Total Trades': strategy_data.get('total_trades', 0)
                }
                strategy_summary.append(summary)
            
            if strategy_summary:
                summary_df = pd.DataFrame(strategy_summary)
                st.dataframe(summary_df, use_container_width=True)
    else:
        st.info("No strategy simulation results available. Run 'make simulate' to generate results.")
    
    # Bankroll Panel
    st.markdown("---")
    st.subheader("💰 Bankroll Management")
    
    if bankroll_status.get('loaded'):
        col1, col2, col3 = st.columns(3)
        
        with col1:
            st.metric("Current Balance", f"${bankroll_status['balance']:,.2f}")
            st.metric("Total Wins", f"${bankroll_status['total_wins']:,.2f}")
        
        with col2:
            daily_loss = bankroll_status['daily_loss_pct']
            st.metric("Daily Loss", f"{daily_loss:.2f}%")
            st.metric("Total Losses", f"${bankroll_status['total_losses']:,.2f}")
        
        with col3:
            st.metric("Betting Status", "✅ Active" if bankroll_status['can_bet'] else "❌ Stopped")
            if daily_loss >= 20:
                st.warning("⚠️ Daily loss cap reached!")
            elif daily_loss >= 15:
                st.warning("⚠️ Approaching daily loss cap")
            else:
                st.success("✅ Daily loss within limits")
    else:
        st.info("No bankroll data available. Bankroll management not configured.")
    
    # Footer
    st.markdown("---")
    st.markdown(f"*Dashboard last updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*")
    
    # Auto-refresh logic
    if auto_refresh:
        time.sleep(2)
        st.experimental_rerun()

if __name__ == "__main__":
    main()
