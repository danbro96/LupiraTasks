import { createBearerMutator } from '@danbro96/lupira-http/mutator';
import { setApiTransport } from '@danbro96/lupira-http/transport';
import { DEV_USER, REQUEST_TIMEOUT_MS } from '../../config';
import { authPort } from './authProvider';

// A side-effect module, imported before anything that issues a request: ES imports hoist, so calling
// this from a function body in the entry file would run after the modules that need it.
setApiTransport(createBearerMutator({
  auth: authPort,
  timeoutMs: REQUEST_TIMEOUT_MS,
  decorate: headers => {
    if (authPort().getAuthMode() !== 'dev') return;
    headers.delete('Authorization');
    headers.set('X-Dev-User', DEV_USER);
  },
}));
