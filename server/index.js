import { createApp } from './app.js';
import { startScheduler } from './scheduler.js';

const port = Number(process.env.PORT || 3000);
createApp().listen(port, () => console.log(`YourCalories running on http://localhost:${port}`));
startScheduler();
