export type UserRole = 'ADMIN' | 'OPERATOR';
export type AccountCurrency = 'ARS' | 'USD';
export type AccountType = 'CASH' | 'BANK';
export type CheckStatus = 'PENDING_PURCHASE' | 'IN_PORTFOLIO' | 'DELIVERED' | 'DEPOSITED' | 'REJECTED';
export type TransactionType = 'INCOME' | 'OUTCOME' | 'TRANSFER' | 'FX_TRADE' | 'CHECK_TRADE';
export type TransactionCategory =
  | 'OPERATING_EXPENSE'
  | 'SALARY'
  | 'COMMISSION'
  | 'INTEREST_INCOME'
  | 'CAPITAL_CONTRIBUTION'
  | 'PARTNER_WITHDRAWAL'
  | 'CLIENT_FUNDING'
  | 'CHECK_DEPOSIT'
  | 'OTHER';
export type MovementType = 'DEBIT' | 'CREDIT';
