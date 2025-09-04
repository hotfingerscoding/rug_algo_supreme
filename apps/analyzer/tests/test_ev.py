#!/usr/bin/env python3
"""
Unit tests for EV Engine
"""

import unittest
import tempfile
import json
import os
import sys
import numpy as np

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from strategy.ev import EVEngine, EVConfig, EVResult, calculate_ev

class TestEVEngine(unittest.TestCase):
    """Test cases for EV Engine"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.engine = EVEngine()
        self.test_config = EVConfig(
            cash_slippage_pct=0.001,
            sidebet_payout=4.0,
            sidebet_fee_pct=0.01,
            cash_hold_dt_s=1.0,
            future_gain_multiplier_if_survive=1.1,
            safety_floor_x=1.01
        )
    
    def test_config_loading(self):
        """Test configuration loading"""
        # Test with valid config file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            config_data = {
                "cash_slippage_pct": 0.003,
                "sidebet_payout": 6.0
            }
            json.dump(config_data, f)
            config_path = f.name
        
        try:
            engine = EVEngine(config_path)
            self.assertEqual(engine.config.cash_slippage_pct, 0.003)
            self.assertEqual(engine.config.sidebet_payout, 6.0)
        finally:
            os.unlink(config_path)
        
        # Test with missing file (should use defaults)
        engine = EVEngine("nonexistent.json")
        self.assertEqual(engine.config.cash_slippage_pct, 0.002)
    
    def test_probability_clamping(self):
        """Test probability clamping to valid range"""
        # Test extreme values
        self.assertEqual(self.engine._clamp_probability(-1.0), self.engine.config.min_probability)
        self.assertEqual(self.engine._clamp_probability(2.0), self.engine.config.max_probability)
        
        # Test valid values
        self.assertEqual(self.engine._clamp_probability(0.5), 0.5)
        self.assertEqual(self.engine._clamp_probability(0.0), self.engine.config.min_probability)
        self.assertEqual(self.engine._clamp_probability(1.0), self.engine.config.max_probability)
    
    def test_ev_cash_hold(self):
        """Test expected value of holding"""
        # Test with low rug probability
        ev_low = self.engine.ev_cash_hold(0.1, 2.0, self.test_config)
        expected_low = 0.9 * (2.0 * 1.1) + 0.1 * 1.01
        self.assertAlmostEqual(ev_low, expected_low, places=6)
        
        # Test with high rug probability
        ev_high = self.engine.ev_cash_hold(0.9, 2.0, self.test_config)
        expected_high = 0.1 * (2.0 * 1.1) + 0.9 * 1.01
        self.assertAlmostEqual(ev_high, expected_high, places=6)
        
        # Test edge case: p_rug = 0
        ev_zero = self.engine.ev_cash_hold(0.0, 2.0, self.test_config)
        expected_zero = 2.0 * 1.1
        self.assertAlmostEqual(ev_zero, expected_zero, places=6)
    
    def test_ev_cash_now(self):
        """Test expected value of cashing now"""
        # Test with different multipliers
        ev_1 = self.engine.ev_cash_now(1.0, self.test_config)
        expected_1 = 1.0 * (1 - 0.001)
        self.assertAlmostEqual(ev_1, expected_1, places=6)
        
        ev_5 = self.engine.ev_cash_now(5.0, self.test_config)
        expected_5 = 5.0 * (1 - 0.001)
        self.assertAlmostEqual(ev_5, expected_5, places=6)
    
    def test_ev_sidebet(self):
        """Test expected value of sidebet"""
        stake = 100.0
        
        # Test with low rug probability
        ev_low = self.engine.ev_sidebet(0.1, stake, self.test_config)
        expected_low = 0.1 * (stake * (4.0 - 1) * (1 - 0.01)) + 0.9 * (-stake)
        self.assertAlmostEqual(ev_low, expected_low, places=6)
        
        # Test with high rug probability
        ev_high = self.engine.ev_sidebet(0.9, stake, self.test_config)
        expected_high = 0.9 * (stake * (4.0 - 1) * (1 - 0.01)) + 0.1 * (-stake)
        self.assertAlmostEqual(ev_high, expected_high, places=6)
        
        # Test break-even probability
        # EV = p * win - (1-p) * stake = 0
        # p * win = (1-p) * stake
        # p * win = stake - p * stake
        # p * (win + stake) = stake
        # p = stake / (win + stake)
        win_amount = stake * (4.0 - 1) * (1 - 0.01)
        break_even_p = stake / (win_amount + stake)
        ev_break_even = self.engine.ev_sidebet(break_even_p, stake, self.test_config)
        self.assertAlmostEqual(ev_break_even, 0.0, places=4)
    
    def test_best_action(self):
        """Test best action determination"""
        # Test case where holding is best
        result = self.engine.best_action(0.1, 0.2, 2.0, 1000.0, self.test_config)
        self.assertIn(result.action, ['HOLD', 'CASH', 'ARM_SIDEBET'])
        self.assertGreaterEqual(result.confidence, 0.05)
        self.assertLessEqual(result.confidence, 0.95)
        self.assertIn('rationale', result.__dict__)
        
        # Test case where cashing is best (very high rug probability)
        result = self.engine.best_action(0.9, 0.95, 1.5, 1000.0, self.test_config)
        self.assertIn(result.action, ['HOLD', 'CASH', 'ARM_SIDEBET'])
        
        # Test case where sidebet is best (high rug probability, good payout)
        result = self.engine.best_action(0.8, 0.85, 1.1, 1000.0, self.test_config)
        self.assertIn(result.action, ['HOLD', 'CASH', 'ARM_SIDEBET'])
    
    def test_edge_cases(self):
        """Test edge cases and boundary conditions"""
        # Test with very small probabilities
        result = self.engine.best_action(1e-10, 1e-10, 1.0, 1000.0, self.test_config)
        self.assertIsInstance(result, EVResult)
        
        # Test with very large probabilities
        result = self.engine.best_action(0.999999, 0.999999, 1.0, 1000.0, self.test_config)
        self.assertIsInstance(result, EVResult)
        
        # Test with zero multiplier
        result = self.engine.best_action(0.5, 0.5, 0.0, 1000.0, self.test_config)
        self.assertIsInstance(result, EVResult)
        
        # Test with very large multiplier
        result = self.engine.best_action(0.5, 0.5, 100.0, 1000.0, self.test_config)
        self.assertIsInstance(result, EVResult)
    
    def test_get_all_evs(self):
        """Test getting all EV calculations"""
        evs = self.engine.get_all_evs(0.3, 0.5, 2.0, 1000.0, self.test_config)
        
        self.assertIn('ev_hold', evs)
        self.assertIn('ev_cash_now', evs)
        self.assertIn('ev_sidebet', evs)
        self.assertIn('ev_hold_vs_cash', evs)
        
        # Check that values are numeric
        for key, value in evs.items():
            self.assertIsInstance(value, (int, float))
            self.assertFalse(np.isnan(value))
            self.assertFalse(np.isinf(value))
    
    def test_convenience_function(self):
        """Test the convenience calculate_ev function"""
        result = calculate_ev(0.3, 0.5, 2.0, 1000.0)
        self.assertIsInstance(result, EVResult)
        self.assertIn(result.action, ['HOLD', 'CASH', 'ARM_SIDEBET'])

class TestEVConfig(unittest.TestCase):
    """Test cases for EVConfig dataclass"""
    
    def test_default_values(self):
        """Test default configuration values"""
        config = EVConfig()
        self.assertEqual(config.cash_slippage_pct, 0.002)
        self.assertEqual(config.sidebet_payout, 5.0)
        self.assertEqual(config.sidebet_fee_pct, 0.02)
        self.assertEqual(config.cash_hold_dt_s, 2.0)
        self.assertEqual(config.future_gain_multiplier_if_survive, 1.15)
        self.assertEqual(config.safety_floor_x, 1.02)
    
    def test_custom_values(self):
        """Test custom configuration values"""
        config = EVConfig(
            cash_slippage_pct=0.005,
            sidebet_payout=10.0,
            sidebet_fee_pct=0.05
        )
        self.assertEqual(config.cash_slippage_pct, 0.005)
        self.assertEqual(config.sidebet_payout, 10.0)
        self.assertEqual(config.sidebet_fee_pct, 0.05)
        # Check that other values use defaults
        self.assertEqual(config.cash_hold_dt_s, 2.0)

if __name__ == '__main__':
    unittest.main()
