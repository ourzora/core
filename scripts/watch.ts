import chokidar from 'chokidar';
import system from 'system-commands';

chokidar.watch('./contracts').on('change', async (path) => {
  console.log(`File ${path} changed. Recompiling..`);
  try {
    await system('yarn build:contracts');
  } catch (err) {
    console.log('recompile failed with error: ', err);
  }
  console.log('Recompiled.');
});
