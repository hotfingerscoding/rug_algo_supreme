# Research Plan: Rugs.fun Round Analysis

## Metrics Per Round

### Core Metrics
- **max_x**: Maximum multiplier reached during round
- **min_x**: Minimum multiplier (typically 1.00x)
- **avg_x**: Average multiplier across all ticks
- **duration**: Total round duration in seconds
- **rug_time_s**: Time from last live tick to rug (if applicable)
- **rug_x**: Multiplier value at rug moment
- **players**: Number of active players
- **total_wager**: Total wager amount in round
- **timestamps**: Start and end timestamps

### Derived Metrics
- **volatility**: Standard deviation of multiplier changes
- **acceleration**: Rate of change in multiplier growth
- **player_velocity**: Rate of change in player count
- **wager_velocity**: Rate of change in total wager

## Tick-Level Data Structure

Each tick contains:
```json
{
  "ts": 1703123456789,
  "phase": "live|cooldown|unknown",
  "x": 2.45,
  "timerText": "00:15",
  "players": 1250,
  "totalWager": 15000.50
}
```

## WebSocket Data Collection

- **Raw frames**: Store all WebSocket messages for schema mapping
- **Direction**: Track incoming vs outgoing messages
- **Timestamps**: Precise timing for correlation analysis
- **Schema drift detection**: Monitor for message format changes

## Modeling Approach

### 1. Baseline Analysis
- **Kaplan-Meier survival analysis**: Model round duration distributions
- **Descriptive statistics**: Understand multiplier patterns and volatility
- **Correlation analysis**: Identify predictive features

### 2. Predictive Models
- **Logistic regression**: "Rug in next 10s" probability
- **Random Forest**: Non-linear feature interactions
- **Time series features**: Rolling statistics and momentum indicators

### 3. Model Validation
- **Cross-validation**: Time-based splits to prevent data leakage
- **Calibration plots**: Ensure probability estimates are well-calibrated
- **Feature importance**: Identify most predictive variables
- **Live validation**: Compare predictions to actual outcomes

## Risk Management

### Position Sizing
- **Small sizing**: Start with minimal position sizes
- **Half-Kelly**: Use conservative Kelly criterion (50% of full Kelly)
- **Daily loss cap**: Maximum daily loss limit
- **Position limits**: Maximum single position size

### Model Risk
- **Drift alarms**: Monitor for model performance degradation
- **Regular retraining**: Update models with new data
- **Ensemble methods**: Combine multiple model predictions
- **Uncertainty quantification**: Provide confidence intervals

### Operational Risk
- **Data quality checks**: Validate collected data
- **Selector drift**: Monitor DOM structure changes
- **Network resilience**: Handle connection failures gracefully
- **Backup strategies**: Alternative data collection methods

## Success Metrics

### Data Quality
- Collect ≥1000 complete rounds without manual intervention
- Maintain data consistency across restarts
- Detect and log schema drift events

### Model Performance
- Achieve >60% accuracy on rug prediction
- Maintain well-calibrated probability estimates
- Identify statistically significant predictive features

### Operational Reliability
- Run continuously for 24+ hours without issues
- Handle site updates gracefully
- Provide clear error messages and recovery procedures

## Timeline

### Phase 1: Data Collection (Week 1-2)
- Deploy collector and gather initial dataset
- Validate data quality and completeness
- Establish baseline statistics

### Phase 2: Model Development (Week 3-4)
- Engineer features and train initial models
- Validate model performance and calibration
- Document feature importance and insights

### Phase 3: Live Testing (Week 5-6)
- Deploy prediction API
- Monitor model performance in real-time
- Iterate on features and model architecture

### Phase 4: Optimization (Week 7-8)
- Implement risk management controls
- Optimize for production reliability
- Document findings and recommendations
