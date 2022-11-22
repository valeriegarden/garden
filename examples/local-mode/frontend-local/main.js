const { app } = require('./app');

app.listen(8082, '0.0.0.0', () => console.log('Frontend service started'));
