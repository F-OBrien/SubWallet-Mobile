import {
  ActiveCronAndSubscriptionMap,
  BalanceJson,
  ChainRegistry,
  ConfirmationsQueue,
  CrowdloanJson,
  CustomTokenJson,
  NetworkJson,
  NftCollectionJson,
  NftJson,
  PriceJson,
  ResponseSettingsType,
  StakeUnlockingJson,
  StakingJson,
  StakingRewardItem,
  TransactionHistoryItemType,
} from '@subwallet/extension-base/background/KoniTypes';
import {
  AccountJson,
  AuthorizeRequest,
  MetadataRequest,
  SigningRequest,
} from '@subwallet/extension-base/background/types';
import { AuthUrlInfo } from '@subwallet/extension-base/background/handlers/State';

export type StoreStatus = 'INIT' | 'CACHED' | 'SYNCED' | 'WAITING';

export type StoreSlice = {
  isReady?: boolean;
};

export type AccountsSlice = {
  accounts: AccountJson[];
  currentAccountAddress: string;
  currentAccount?: AccountJson;
  isWaiting?: boolean;
} & StoreSlice;

export type AppStateSlice = {
  isLocked: boolean;
  isDisplayConfirmation: boolean;
};

export type AuthUrlsSlice = {
  details: Record<string, AuthUrlInfo>;
} & StoreSlice;

export type BalanceSlice = BalanceJson & StoreSlice;
export type CrowdloanSlice = CrowdloanJson & StoreSlice;

export type ChainRegistrySlice = {
  details: Record<string, ChainRegistry>;
} & StoreSlice;

export type ConfirmationSlice = {
  details: {
    authorizeRequest?: Record<string, AuthorizeRequest>;
    signingRequest?: Record<string, SigningRequest>;
    metadataRequest?: Record<string, MetadataRequest>;
  } & {
    [P in keyof ConfirmationsQueue]?: ConfirmationsQueue[P];
  };
} & StoreSlice;

export type MobileSettingsSlice = {
  language: string;
  pinCode: string;
  pinCodeEnabled: boolean;
  faceIdEnabled: boolean;
  autoLockTime: number | undefined;
};

export type SiteInfo = {
  name: string;
  url: string;
};

export type StoredSiteInfo = {
  id: string;
} & SiteInfo;

export type BrowserSliceTab = {
  id: string;
  url: string;
  screenshot?: string;
};

export type BrowserSlice = {
  activeTab: null | string;
  tabs: BrowserSliceTab[];
  whitelist: string[];
  history: StoredSiteInfo[];
  bookmarks: StoredSiteInfo[];
};

export type NetworkMapSlice = {
  details: Record<string, NetworkJson>;
} & StoreSlice;

export type CustomTokenSlice = { details: CustomTokenJson } & StoreSlice;

export type PriceSlice = Omit<PriceJson, 'ready'> & StoreSlice;

export type SettingsSlice = ResponseSettingsType & StoreSlice;

export type TransactionHistorySlice = {
  details: Record<string, TransactionHistoryItemType[]>;
} & StoreSlice;

export type NftSlice = NftJson & StoreSlice;

export type NftCollectionSlice = NftCollectionJson & StoreSlice;
export type StakingRewardJson_ = {
  details: StakingRewardItem[];
  ready: boolean;
};
export type StakingSlice = StakingJson & StoreSlice;
export type StakeUnlockingSlice = StakeUnlockingJson & StoreSlice;
export type StakingRewardSlice = StakingRewardJson_ & StoreSlice;
export type BackgroundServiceSlice = {
  activeState: ActiveCronAndSubscriptionMap;
};
