import { FirebaseAuthMiddleware } from './firebase.middleware';

describe('FirebaseAuthMiddleware', () => {
  it('should be defined', () => {
    expect(new FirebaseAuthMiddleware()).toBeDefined();
  });
});
