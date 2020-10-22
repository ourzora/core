import chokidar from 'chokidar';
import system from 'system-commands';

chokidar.watch('./contracts').on('change', async (_, path) => {
  console.log(`File ${path} changed. Recompiling..`);
  await system('yarn build:contracts');
  console.log('Recompiled.');
});
