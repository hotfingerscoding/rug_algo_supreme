#!/usr/bin/env python3
"""
Bankroll Management Module for Rugs Research
Implements Kelly criterion, loss caps, and bet sizing
"""

import json
import os
from datetime import datetime, date
from typing import Dict, Any, Optional

class BankrollManager:
    def __init__(self, 
                 initial_balance: float = 1000.0,
                 kelly_fraction: float = 0.5,
                 max_daily_loss_pct: float = 20.0,
                 bet_size_cap: float = 5.0,
                 bankroll_file: str = "../data/bankroll.json"):
        """
        Initialize bankroll manager
        
        Args:
            initial_balance: Starting bankroll amount
            kelly_fraction: Fraction of Kelly criterion to use (0.5 = half-Kelly)
            max_daily_loss_pct: Maximum daily loss as percentage of balance
            bet_size_cap: Maximum bet size as percentage of current balance
            bankroll_file: Path to bankroll state file
        """
        self.initial_balance = initial_balance
        self.kelly_fraction = kelly_fraction
        self.max_daily_loss_pct = max_daily_loss_pct
        self.bet_size_cap = bet_size_cap / 100.0  # Convert to decimal
        self.bankroll_file = bankroll_file
        
        # Load or initialize bankroll state
        self.state = self._load_state()
    
    def _load_state(self) -> Dict[str, Any]:
        """Load bankroll state from file or create new"""
        if os.path.exists(self.bankroll_file):
            try:
                with open(self.bankroll_file, 'r') as f:
                    state = json.load(f)
                
                # Check if we need to reset daily tracking
                last_date = state.get('last_date')
                if last_date != date.today().isoformat():
                    state['daily_loss'] = 0.0
                    state['last_date'] = date.today().isoformat()
                
                return state
            except Exception as e:
                print(f"Warning: Could not load bankroll state: {e}")
        
        # Create new state
        return {
            'balance': self.initial_balance,
            'initial_balance': self.initial_balance,
            'daily_loss': 0.0,
            'last_date': date.today().isoformat(),
            'total_bets': 0,
            'wins': 0,
            'losses': 0,
            'total_profit': 0.0,
            'max_balance': self.initial_balance,
            'min_balance': self.initial_balance,
            'created_at': datetime.now().isoformat(),
            'last_updated': datetime.now().isoformat()
        }
    
    def _save_state(self):
        """Save bankroll state to file"""
        try:
            os.makedirs(os.path.dirname(self.bankroll_file), exist_ok=True)
            self.state['last_updated'] = datetime.now().isoformat()
            with open(self.bankroll_file, 'w') as f:
                json.dump(self.state, f, indent=2)
        except Exception as e:
            print(f"Warning: Could not save bankroll state: {e}")
    
    def size_bet(self, edge: float, odds: float) -> float:
        """
        Calculate recommended bet size using Kelly criterion
        
        Args:
            edge: Probability of winning (0.0 to 1.0)
            odds: Decimal odds (e.g., 2.0 for 1:1 payout)
        
        Returns:
            Recommended bet size as percentage of current balance
        """
        if edge <= 0 or edge >= 1 or odds <= 1:
            return 0.0
        
        # Kelly formula: f = (bp - q) / b
        # where b = odds - 1, p = probability of win, q = probability of loss
        b = odds - 1
        p = edge
        q = 1 - edge
        
        kelly_fraction_raw = (b * p - q) / b
        
        # Apply Kelly fraction (e.g., half-Kelly)
        kelly_fraction_actual = kelly_fraction_raw * self.kelly_fraction
        
        # Cap by maximum bet size
        bet_size = min(kelly_fraction_actual, self.bet_size_cap)
        
        # Ensure non-negative
        return max(0.0, bet_size)
    
    def calculate_bet_amount(self, edge: float, odds: float) -> float:
        """
        Calculate actual bet amount in currency units
        
        Args:
            edge: Probability of winning
            odds: Decimal odds
        
        Returns:
            Bet amount in currency units
        """
        bet_size_pct = self.size_bet(edge, odds)
        return self.state['balance'] * bet_size_pct
    
    def update_balance(self, bet_amount: float, result: float) -> Dict[str, Any]:
        """
        Update bankroll after a bet result
        
        Args:
            bet_amount: Amount bet
            result: Profit/loss from the bet (positive for win, negative for loss)
        
        Returns:
            Dictionary with updated state information
        """
        old_balance = self.state['balance']
        new_balance = old_balance + result
        
        # Update state
        self.state['balance'] = new_balance
        self.state['total_bets'] += 1
        self.state['total_profit'] += result
        
        if result > 0:
            self.state['wins'] += 1
        else:
            self.state['losses'] += 1
            self.state['daily_loss'] += abs(result)
        
        # Update min/max balance
        self.state['max_balance'] = max(self.state['max_balance'], new_balance)
        self.state['min_balance'] = min(self.state['min_balance'], new_balance)
        
        # Save state
        self._save_state()
        
        return {
            'old_balance': old_balance,
            'new_balance': new_balance,
            'profit': result,
            'roi': (result / old_balance) * 100 if old_balance > 0 else 0,
            'total_roi': ((new_balance - self.initial_balance) / self.initial_balance) * 100,
            'win_rate': (self.state['wins'] / self.state['total_bets']) * 100 if self.state['total_bets'] > 0 else 0
        }
    
    def apply_daily_loss_cap(self) -> bool:
        """
        Check if daily loss cap has been exceeded
        
        Returns:
            True if betting should continue, False if cap exceeded
        """
        if self.state['balance'] <= 0:
            return False
        
        daily_loss_pct = (self.state['daily_loss'] / self.state['balance']) * 100
        return daily_loss_pct < self.max_daily_loss_pct
    
    def get_status(self) -> Dict[str, Any]:
        """Get current bankroll status"""
        current_balance = self.state['balance']
        initial_balance = self.state['initial_balance']
        
        return {
            'balance': current_balance,
            'initial_balance': initial_balance,
            'total_roi': ((current_balance - initial_balance) / initial_balance) * 100,
            'daily_loss': self.state['daily_loss'],
            'daily_loss_pct': (self.state['daily_loss'] / current_balance) * 100 if current_balance > 0 else 0,
            'max_daily_loss_pct': self.max_daily_loss_pct,
            'can_bet': self.apply_daily_loss_cap(),
            'total_bets': self.state['total_bets'],
            'wins': self.state['wins'],
            'losses': self.state['losses'],
            'win_rate': (self.state['wins'] / self.state['total_bets']) * 100 if self.state['total_bets'] > 0 else 0,
            'max_balance': self.state['max_balance'],
            'min_balance': self.state['min_balance'],
            'max_drawdown': ((self.state['max_balance'] - current_balance) / self.state['max_balance']) * 100 if self.state['max_balance'] > 0 else 0
        }
    
    def reset_daily_tracking(self):
        """Reset daily loss tracking (call at start of new day)"""
        self.state['daily_loss'] = 0.0
        self.state['last_date'] = date.today().isoformat()
        self._save_state()
    
    def reset_bankroll(self, new_balance: Optional[float] = None):
        """Reset bankroll to initial state or new balance"""
        if new_balance is None:
            new_balance = self.initial_balance
        
        self.state = {
            'balance': new_balance,
            'initial_balance': new_balance,
            'daily_loss': 0.0,
            'last_date': date.today().isoformat(),
            'total_bets': 0,
            'wins': 0,
            'losses': 0,
            'total_profit': 0.0,
            'max_balance': new_balance,
            'min_balance': new_balance,
            'created_at': datetime.now().isoformat(),
            'last_updated': datetime.now().isoformat()
        }
        self._save_state()

def create_bankroll_manager(initial_balance: float = 1000.0,
                           kelly_fraction: float = 0.5,
                           max_daily_loss_pct: float = 20.0,
                           bet_size_cap: float = 5.0) -> BankrollManager:
    """Factory function to create a bankroll manager"""
    return BankrollManager(
        initial_balance=initial_balance,
        kelly_fraction=kelly_fraction,
        max_daily_loss_pct=max_daily_loss_pct,
        bet_size_cap=bet_size_cap
    )

# Example usage and testing
if __name__ == "__main__":
    # Create bankroll manager
    bm = create_bankroll_manager(initial_balance=1000, kelly_fraction=0.5)
    
    # Example bet sizing
    edge = 0.6  # 60% chance of winning
    odds = 2.0  # 1:1 payout
    
    bet_size_pct = bm.size_bet(edge, odds)
    bet_amount = bm.calculate_bet_amount(edge, odds)
    
    print(f"Edge: {edge:.1%}, Odds: {odds:.1f}")
    print(f"Bet size: {bet_size_pct:.1%} of balance")
    print(f"Bet amount: ${bet_amount:.2f}")
    
    # Example bet result
    result = bm.update_balance(bet_amount, 50.0)  # Win $50
    print(f"Bet result: {result}")
    
    # Check status
    status = bm.get_status()
    print(f"Current status: {status}")
