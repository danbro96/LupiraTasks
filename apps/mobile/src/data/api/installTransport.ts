import { setApiTransport } from '@lupira/tasks-api/transport';
import { apiFetch } from './mutator';

// A side-effect module, imported before anything that issues a request: ES imports hoist, so calling
// this from a function body in the entry file would run after the modules that need it.
setApiTransport(apiFetch);
