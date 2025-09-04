# Cursor Memory for Rugs Research

## Main Goal (PINNED)
Collect reliable round-level and tick-level data from rugs.fun (public client-side only; no ToS bypass), analyze the hazard of a "rug" event over time/multiplier, and surface live guidance for cashout and sidebet timing with strict bankroll/risk controls.

## Data Model
- **Rounds**: Complete game cycles with start/end times, max/min/avg multipliers, rug timing
- **Ticks**: Individual data points with timestamp, phase, multiplier, timer, players, wager
- **WS Frames**: Raw WebSocket communication for schema mapping
- **Sidebet Windows**: Optional timing windows for sidebet opportunities

## Round Segmentation
- **Cooldown**: Waiting period between rounds
- **Live**: Active game with increasing multiplier
- **Rug**: Game ends, multiplier crashes
- **Cooldown**: Back to waiting period

## Features for Modeling
- **Time since start**: Seconds elapsed in current round
- **Multiplier (x)**: Current game multiplier value
- **Slope**: Rate of change in multiplier (dx/dt)
- **Volatility**: Rolling standard deviation of recent multipliers
- **Player deltas**: Changes in player count
- **Wager deltas**: Changes in total wager amount

## Model Outputs
- **p_rug_5s**: Probability of rug occurring within 5 seconds
- **p_rug_10s**: Probability of rug occurring within 10 seconds
- **Suggested action**: hold/trim/cash/arm sidebet
- **Risk controls**: Kelly half-cap and daily loss cap

## Known Fragile Points
- **DOM selectors**: May drift with site updates → log warnings
- **WebSocket schema**: Message format may change → store raw frames
- **Phase detection**: Relies on visual indicators → fallback to timing heuristics
- **Round boundaries**: Edge cases in segmentation → validate with multiple signals

## Site Behavior Patterns
- Rounds typically last 30-300 seconds
- Multipliers start at 1.00x and increase exponentially
- Rugs can occur at any multiplier value
- Player count and wager patterns may indicate rug timing
- WebSocket messages contain real-time game state updates

## Risk Management
- Never automate actual betting
- Use half-Kelly criterion for position sizing
- Implement daily loss limits
- Monitor model drift and recalibrate regularly
- Log all predictions and outcomes for validation
