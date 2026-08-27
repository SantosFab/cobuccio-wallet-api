// Single source of truth for every event type recorded to `user_events` —
// mirrors the UserEventType pattern from ChartChampions-Api's analytics
// module, so event names are typed and centralized instead of scattered
// as string literals across services.
export enum UserEventType {
  // Users
  UserRegistered = 'user.registered',

  // Auth
  AuthLoginSucceeded = 'auth.login_succeeded',
  AuthLoginFailed = 'auth.login_failed',
  AuthLogout = 'auth.logout',
  AuthRefreshTokenReused = 'auth.refresh_token_reused',

  // Wallet
  WalletDepositCompleted = 'wallet.deposit_completed',
  WalletDepositRejectedInvalidCard = 'wallet.deposit_rejected_invalid_card',
  WalletTransferCompleted = 'wallet.transfer_completed',
  WalletReversalCompleted = 'wallet.reversal_completed',
}
