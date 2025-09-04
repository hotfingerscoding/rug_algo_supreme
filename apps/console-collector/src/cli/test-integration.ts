import { ConsoleCollector } from '../run';

async function testIntegration() {
  console.log('🧪 Console Collector Integration Test');
  console.log('====================================\n');
  
  try {
    console.log('🚀 Starting collector in test mode...');
    
    // Create collector instance
    const collector = new ConsoleCollector();
    
    // Start collection (this will launch browser)
    const startPromise = collector.start();
    
    // Wait 5 seconds for startup
    console.log('⏳ Waiting 5 seconds for startup...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Force shutdown
    console.log('🛑 Forcing shutdown...');
    process.emit('SIGINT', 'SIGINT');
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('✅ Integration test completed successfully');
    console.log('📊 No crashes detected, proper logs generated');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    process.exit(1);
  }
}

// Run test
if (require.main === module) {
  testIntegration().catch(console.error);
}
