#!/usr/bin/env python3
"""
Expected Value (EV) Engine for Cash & Sidebet Decisions
"""

import json
import os
import numpy as np
from typing import Dict, Tuple, Literal
from dataclasses import dataclass

@dataclass
class EVConfig:
    """Configuration for EV calculations"""
    cash_slippage_pct: float = 0.002
    sidebet_payout: float = 5.0
    sidebet_fee_pct: float = 0.02
    cash_hold_dt_s: float = 2.0
    future_gain_multiplier_if_survive: float = 1.15
    safety_floor_x: float = 1.02
    min_probability: float = 1e-6
    max_probability: float = 0.999999
    default_stake_pct: float = 0.01
    max_stake_pct: float = 0.05
    ev_threshold: float = 0.001

@dataclass
class EVResult:
    """Result of EV calculation"""
    action: Literal['HOLD', 'TRIM', 'CASH', 'ARM_SIDEBET']
    evs: Dict[str, float]
    rationale: str
    confidence: float

class EVEngine:
    """Expected Value calculation engine for trading decisions"""
    
    def __init__(self, config_path: str = "config/ev.json"):
        self.config = self._load_config(config_path)
    
    def _load_config(self, config_path: str) -> EVConfig:
        """Load configuration from JSON file"""
        try:
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    config_dict = json.load(f)
                return EVConfig(**config_dict)
            else:
                print(f"Config file {config_path} not found, using defaults")
                return EVConfig()
        except Exception as e:
            print(f"Error loading config: {e}, using defaults")
            return EVConfig()
    
    def _clamp_probability(self, p: float) -> float:
        """Clamp probability to valid range"""
        return np.clip(p, self.config.min_probability, self.config.max_probability)
    
    def ev_cash_hold(self, p_rug_5s: float, x: float, cfg: EVConfig = None) -> float:
        """
        Expected value of holding for cash_hold_dt_s more seconds
        
        Args:
            p_rug_5s: Probability of rug within 5 seconds
            x: Current multiplier
            cfg: Configuration (uses self.config if None)
        
        Returns:
            Expected value of holding
        """
        if cfg is None:
            cfg = self.config
        
        # Clamp probability
        p_rug = self._clamp_probability(p_rug_5s)
        
        # Probability of surviving the hold period
        p_survive = 1 - p_rug
        
        # If we survive, we get future gains
        future_x = x * cfg.future_gain_multiplier_if_survive
        
        # If we crash, we get safety floor (or 0)
        crash_x = cfg.safety_floor_x
        
        # Expected value
        ev = p_survive * future_x + p_rug * crash_x
        
        return ev
    
    def ev_cash_now(self, x: float, cfg: EVConfig = None) -> float:
        """
        Expected value of cashing now (after slippage)
        
        Args:
            x: Current multiplier
            cfg: Configuration (uses self.config if None)
        
        Returns:
            Expected value of cashing now
        """
        if cfg is None:
            cfg = self.config
        
        # Apply slippage
        cash_value = x * (1 - cfg.cash_slippage_pct)
        
        return cash_value
    
    def ev_sidebet(self, p_rug_10s: float, stake: float, cfg: EVConfig = None) -> float:
        """
        Expected value of sidebet given payout and fees
        
        Args:
            p_rug_10s: Probability of rug within 10 seconds
            stake: Stake amount
            cfg: Configuration (uses self.config if None)
        
        Returns:
            Expected value of sidebet
        """
        if cfg is None:
            cfg = self.config
        
        # Clamp probability
        p_rug = self._clamp_probability(p_rug_10s)
        
        # If rug occurs, we win the sidebet
        win_amount = stake * (cfg.sidebet_payout - 1) * (1 - cfg.sidebet_fee_pct)
        
        # If no rug, we lose our stake
        loss_amount = -stake
        
        # Expected value
        ev = p_rug * win_amount + (1 - p_rug) * loss_amount
        
        return ev
    
    def best_action(self, p5: float, p10: float, x: float, bankroll: float, 
                   cfg: EVConfig = None) -> EVResult:
        """
        Determine the best action based on EV calculations
        
        Args:
            p5: Probability of rug within 5 seconds
            p10: Probability of rug within 10 seconds
            x: Current multiplier
            bankroll: Current bankroll balance
            cfg: Configuration (uses self.config if None)
        
        Returns:
            EVResult with recommended action and rationale
        """
        if cfg is None:
            cfg = self.config
        
        # Clamp probabilities
        p5 = self._clamp_probability(p5)
        p10 = self._clamp_probability(p10)
        
        # Calculate EVs for each action
        ev_hold = self.ev_cash_hold(p5, x, cfg)
        ev_cash = self.ev_cash_now(x, cfg)
        ev_sidebet = self.ev_sidebet(p10, bankroll * cfg.default_stake_pct, cfg)
        
        # Calculate EV deltas
        ev_hold_vs_cash = ev_hold - ev_cash
        ev_sidebet_vs_cash = ev_sidebet
        
        # Determine best action
        actions = []
        evs = {}
        
        # Add hold action
        actions.append(('HOLD', ev_hold_vs_cash, 'Hold for potential gains'))
        evs['HOLD'] = ev_hold_vs_cash
        
        # Add cash action
        actions.append(('CASH', 0, 'Cash out now'))
        evs['CASH'] = 0
        
        # Add sidebet if EV is positive
        if ev_sidebet_vs_cash > cfg.ev_threshold:
            actions.append(('ARM_SIDEBET', ev_sidebet_vs_cash, 'Place sidebet for positive EV'))
            evs['ARM_SIDEBET'] = ev_sidebet_vs_cash
        
        # Sort by EV (descending)
        actions.sort(key=lambda x: x[1], reverse=True)
        
        best_action_name = actions[0][0]
        best_ev = actions[0][1]
        second_best_ev = actions[1][1] if len(actions) > 1 else 0
        
        # Calculate confidence based on EV difference
        ev_delta = best_ev - second_best_ev
        confidence = min(0.95, max(0.05, 0.5 + ev_delta * 10))  # Scale confidence
        
        # Generate rationale
        if best_action_name == 'HOLD':
            if ev_hold_vs_cash > 0:
                rationale = f"Hold: Expected gain of {ev_hold_vs_cash:.4f} vs cashing now"
            else:
                rationale = f"Hold: Minimal loss ({ev_hold_vs_cash:.4f}) vs potential upside"
        elif best_action_name == 'CASH':
            rationale = f"Cash: Secure {ev_cash:.4f} now vs uncertain future"
        elif best_action_name == 'ARM_SIDEBET':
            rationale = f"Sidebet: Positive EV of {ev_sidebet_vs_cash:.4f}"
        else:
            rationale = "No clear edge - defaulting to hold"
        
        return EVResult(
            action=best_action_name,
            evs=evs,
            rationale=rationale,
            confidence=confidence
        )
    
    def get_all_evs(self, p5: float, p10: float, x: float, bankroll: float,
                    cfg: EVConfig = None) -> Dict[str, float]:
        """Get all EV calculations for comparison"""
        if cfg is None:
            cfg = self.config
        
        return {
            'ev_hold': self.ev_cash_hold(p5, x, cfg),
            'ev_cash_now': self.ev_cash_now(x, cfg),
            'ev_sidebet': self.ev_sidebet(p10, bankroll * cfg.default_stake_pct, cfg),
            'ev_hold_vs_cash': self.ev_cash_hold(p5, x, cfg) - self.ev_cash_now(x, cfg)
        }

# Convenience function for quick EV calculations
def calculate_ev(p5: float, p10: float, x: float, bankroll: float = 1000.0,
                config_path: str = "config/ev.json") -> EVResult:
    """Quick EV calculation using default settings"""
    engine = EVEngine(config_path)
    return engine.best_action(p5, p10, x, bankroll)

if __name__ == "__main__":
    # Example usage
    engine = EVEngine()
    
    # Test case
    result = engine.best_action(
        p5=0.3,      # 30% chance of rug in 5s
        p10=0.5,     # 50% chance of rug in 10s
        x=2.5,       # Current multiplier
        bankroll=1000.0  # Bankroll
    )
    
    print(f"Best Action: {result.action}")
    print(f"Confidence: {result.confidence:.2%}")
    print(f"Rationale: {result.rationale}")
    print(f"EVs: {result.evs}")
