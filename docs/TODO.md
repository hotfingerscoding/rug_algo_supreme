# TODO: Rugs Research Development Checklist

## Phase 1: Foundation Setup ✅

### ✅ Monorepo Structure
- [x] Create pnpm workspace with apps/ and packages/
- [x] Set up TypeScript configurations with strict mode
- [x] Configure ESLint, Prettier, and Husky
- [x] Create environment variable templates
- [x] Set up directory structure for data, docs, logs

### ✅ Shared Packages
- [x] Create @rugs-research/schema with zod schemas
- [x] Create @rugs-research/shared with utilities
- [x] Implement Logger, SQLiteHelper, and Config classes
- [x] Add TypeScript types for Tick, Round, WSFrame

### ✅ Documentation Foundation
- [x] Create .cursor/rules.md with hard rules
- [x] Create .cursor/memory.md with persistent memory
- [x] Create docs/RESEARCH_PLAN.md with metrics and approach
- [x] Create docs/ACCEPTANCE_CRITERIA.md with clear checks
- [x] Create docs/TODO.md (this file)

## Phase 2: Data Collection 🚧

### 🚧 Collector App
- [x] Set up Playwright with TypeScript
- [x] Create selector configuration with TODO comments
- [x] Implement WebSocket monitoring via CDP
- [x] Implement DOM polling for game data
- [x] Create round segmentation logic
- [x] Implement SQLite data storage
- [x] Add drift detection and warnings
- [x] Implement graceful shutdown handling
- [ ] Test collector with real site data
- [ ] Validate round segmentation accuracy

### 🚧 Data Validation
- [x] Create zod schemas for data validation
- [x] Add data quality checks
- [x] Implement schema drift detection
- [x] Add data export functionality
- [ ] Test data integrity across restarts

### 🚧 Selector Configuration
- [x] Add placeholder defaults with TODO_UPDATE_SELECTOR
- [x] Add inline comments for inspection guidance
- [x] Implement validateSelectors() function
- [x] Add SelectorDriftTracker class
- [x] Integrate drift warnings into collector
- [ ] Update selectors by hand after first inspection of rugs.fun
- [ ] Verify drift warnings fire correctly with dummy bad selectors

## Phase 3: Analysis & Modeling 📋

### 📋 Analyzer App
- [x] Set up Python environment with requirements
- [x] Create FastAPI prediction server
- [x] Implement model loading from JSON
- [x] Create analysis script (round_analysis.py)
- [ ] Implement feature engineering pipeline
- [ ] Add survival analysis (Kaplan-Meier)
- [ ] Train Random Forest models
- [ ] Generate model validation plots
- [ ] Export models to JSON format

### 📋 Model Training
- [ ] Load and validate collected data
- [ ] Engineer time-based features
- [ ] Create training/validation splits
- [ ] Train 5s and 10s prediction models
- [ ] Validate model calibration
- [ ] Generate feature importance analysis
- [ ] Save trained models with metadata

## Phase 4: API & Integration 📋

### 📋 Prediction API
- [x] Create FastAPI server structure
- [x] Implement model loading logic
- [x] Add prediction endpoint
- [x] Add health check and model info endpoints
- [ ] Add input validation with Pydantic
- [ ] Implement error handling
- [ ] Add model reload functionality
- [ ] Test API with real predictions

### 📋 Data Export
- [x] Create CSV export script
- [ ] Add NDJSON export option
- [ ] Implement data compression
- [ ] Add export scheduling
- [ ] Test export data integrity

## Phase 5: Testing & Validation 📋

### 📋 Unit Tests
- [ ] Test collector data extraction
- [ ] Test round segmentation logic
- [ ] Test model training pipeline
- [ ] Test API endpoints
- [ ] Test data export functionality

### 📋 Integration Tests
- [ ] Test end-to-end data flow
- [ ] Test model training and prediction
- [ ] Test API with real data
- [ ] Test error handling scenarios

### 📋 Performance Tests
- [ ] Test collector memory usage
- [ ] Test API response times
- [ ] Test database performance
- [ ] Test long-running stability

## Phase 6: Documentation & Deployment 📋

### 📋 Documentation
- [ ] Create comprehensive README.md
- [x] Write detailed RUNBOOK.md
- [x] Add troubleshooting guide
- [x] Document configuration options
- [ ] Create API documentation

### 📋 CI/CD
- [ ] Set up GitHub Actions workflows
- [ ] Add lint and build checks
- [ ] Add test automation
- [ ] Configure deployment pipeline

### 📋 Production Readiness
- [ ] Add monitoring and logging
- [ ] Implement error tracking
- [ ] Add performance metrics
- [ ] Create backup and recovery procedures

## Phase 7: Optimization & Enhancement 📋

### 📋 Model Improvements
- [ ] Experiment with different algorithms
- [ ] Add ensemble methods
- [ ] Implement feature selection
- [ ] Add uncertainty quantification

### 📋 System Enhancements
- [ ] Add real-time monitoring dashboard
- [ ] Implement automated model retraining
- [ ] Add data quality monitoring
- [ ] Create alerting system

## Milestone Gates

### Gate 1: Data Collection Ready
- [ ] Collector runs for 24+ hours without issues
- [ ] Collects ≥1000 complete rounds
- [ ] Data quality validation passes
- [ ] Round segmentation accuracy >90%
- [ ] Drift warnings fire correctly with bad selectors

### Gate 2: Model Training Complete
- [ ] Models achieve >60% prediction accuracy
- [ ] Feature importance analysis complete
- [ ] Model calibration validated
- [ ] Survival analysis plots generated

### Gate 3: API Production Ready
- [ ] API responds in <100ms
- [ ] All endpoints tested and working
- [ ] Error handling comprehensive
- [ ] Documentation complete

### Gate 4: System Integration Complete
- [ ] End-to-end workflow tested
- [ ] All acceptance criteria met
- [ ] Performance requirements satisfied
- [ ] Security review passed

## Current Status

**Phase**: 2 - Data Collection
**Next Priority**: Update selectors by hand after first inspection of rugs.fun
**Blockers**: None currently identified
**Estimated Completion**: 2-3 weeks for full system

## Notes

- All selectors need manual inspection and updating for rugs.fun
- Model performance will depend on data quality and feature engineering
- API response times may need optimization for production use
- Consider adding more sophisticated error handling and recovery mechanisms
- Drift warnings are now implemented and should be tested with dummy bad selectors
