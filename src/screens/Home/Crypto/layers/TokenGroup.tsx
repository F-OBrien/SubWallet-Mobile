import { ScreenContainer } from 'components/ScreenContainer';
import React, { useState } from 'react';
import { Header } from 'components/Header';
import { SubHeader } from 'components/SubHeader';
import { ColorMap } from 'styles/color';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from 'routes/index';
import * as Tabs from 'react-native-collapsible-tab-view';
import {
  isItemAllowedToShow,
  itemWrapperAppendixStyle,
  itemWrapperStyle,
  renderTabBar,
} from 'screens/Home/Crypto/layers/shared';
import { TokensTab } from 'screens/Home/Crypto/tabs/TokensTab';
import { ChainsTab } from 'screens/Home/Crypto/tabs/ChainsTab';
import { AccountInfoByNetwork, AccountType, TokenBalanceItemType } from 'types/ui-types';
import BigN from 'bignumber.js';
import { BalanceInfo, BalanceSubInfo } from 'types/index';
import { ListRenderItemInfo, View } from 'react-native';
import { TokenChainBalance } from 'components/TokenChainBalance';
import TabsContainerHeader from 'screens/Home/Crypto/TabsContainerHeader';
import { BN_ZERO, getTokenDisplayName } from 'utils/chainBalances';
import { useRefresh } from 'hooks/useRefresh';
import i18n from 'utils/i18n/i18n';
import useTokenBalanceItems from 'hooks/screen/Home/Crypto/layers/TokenGroup/useTokenBalanceItems';
import { ChainBalance } from 'components/ChainBalance';
import { restartSubscriptionServices } from '../../../../messaging';

interface Prop {
  isShowZeroBalance?: boolean;
  accountType: AccountType;
  navigation: NativeStackNavigationProp<RootStackParamList>;
  onPressSearchButton: () => void;
  accountInfoByNetworkMap: Record<string, AccountInfoByNetwork>;
  onPressChainItem: (info: AccountInfoByNetwork, balanceInfo: BalanceInfo) => void;
  tokenGroupMap: Record<string, string[]>;
  tokenBalanceKeyPriceMap: Record<string, number>;
  tokenBalanceMap: Record<string, TokenBalanceItemType>;
  showedNetworks: string[];
  networkBalanceMap: Record<string, BalanceInfo>;
  handleChangeTokenItem: (tokenSymbol: string, tokenDisplayName: string, info?: AccountInfoByNetwork) => void;
  totalBalanceValue: BigN;
}

const prioritizedNetworkKeys = ['kusama', 'polkadot'];

function getTokenGroupDisplayName(tgKey: string) {
  const [symbol] = tgKey.split('|');
  return getTokenDisplayName(symbol.toUpperCase());
}

function getBalanceValue(
  isGroupDetail: boolean,
  currentTgKey: string,
  totalBalanceValue: BigN,
  tokenGroupMap: Record<string, string[]>,
  tokenBalanceMap: Record<string, TokenBalanceItemType>,
): BigN {
  if (!isGroupDetail) {
    return totalBalanceValue;
  }

  if (currentTgKey && tokenGroupMap[currentTgKey]) {
    let result = new BigN(0);

    tokenGroupMap[currentTgKey].forEach(tbKey => {
      if (tokenBalanceMap[tbKey] && tokenBalanceMap[tbKey].isReady) {
        result = result.plus(tokenBalanceMap[tbKey].convertedBalanceValue);
      }
    });

    return result;
  }

  return BN_ZERO;
}

function getChainTabsNetworkKeys(
  isGroupDetail: boolean,
  tokenBalanceItems: TokenBalanceItemType[],
  tokenGroupMap: Record<string, string[]>,
  showedNetworks: string[],
  accountType: AccountType,
  isShowZeroBalance?: boolean,
): string[] {
  if (!isGroupDetail) {
    const result = showedNetworks.filter(k => !prioritizedNetworkKeys.includes(k));
    prioritizedNetworkKeys.forEach(pk => {
      if (showedNetworks.includes(pk)) {
        result.unshift(pk);
      }
    });
    return result;
  }

  const networkKeys: string[] = [];

  tokenBalanceItems.forEach(item => {
    if (!isItemAllowedToShow(item, accountType, tokenGroupMap, isShowZeroBalance)) {
      return;
    }

    if (!networkKeys.includes(item.networkKey)) {
      networkKeys.push(item.networkKey);
    }
  });

  const result: string[] = networkKeys.filter(k => !prioritizedNetworkKeys.includes(k)).sort();

  prioritizedNetworkKeys.forEach(pk => {
    if (networkKeys.includes(pk)) {
      result.unshift(pk);
    }
  });

  return result;
}

const alwaysShowedNetworkKeys = ['kusama', 'polkadot'];

function getEmptyBalanceInfo(nativeToken?: string) {
  return {
    symbol: nativeToken || 'UNIT',
    displayedSymbol: (nativeToken && getTokenDisplayName(nativeToken)) || 'UNIT',
    balanceValue: BN_ZERO,
    convertedBalanceValue: BN_ZERO,
    detailBalances: [],
    childrenBalances: [],
    isReady: false,
  };
}

function checkExistedChildrenBalance(childrenBalances: BalanceSubInfo[]) {
  if (childrenBalances.length) {
    return childrenBalances.some(ele => !ele.balanceValue.eq(BN_ZERO));
  } else {
    return false;
  }
}

function isEmptyList(
  list: TokenBalanceItemType[],
  accountType: AccountType,
  tokenGroupMap: Record<string, string[]>,
  isShowZeroBalance?: boolean,
) {
  if (!list.length) {
    return true;
  }
  const filteredList = list.filter(item => isItemAllowedToShow(item, accountType, tokenGroupMap, isShowZeroBalance));
  return !filteredList.length;
}

const TokenGroupLayer = ({
  accountType,
  navigation,
  onPressSearchButton,
  accountInfoByNetworkMap,
  onPressChainItem,
  tokenGroupMap,
  tokenBalanceKeyPriceMap,
  tokenBalanceMap,
  showedNetworks,
  networkBalanceMap,
  handleChangeTokenItem,
  totalBalanceValue,
  isShowZeroBalance,
}: Prop) => {
  const [isRefresh, refresh] = useRefresh();
  const [currentTgKey, setCurrentTgKey] = useState<string>('');
  const [isGroupDetail, setGroupDetail] = useState<boolean>(false);
  const [refreshTabId, setRefreshTabId] = useState<string>('');
  const onPressBack = () => {
    setCurrentTgKey('');
    setGroupDetail(false);
  };
  const tokenBalanceItems = useTokenBalanceItems(
    isGroupDetail,
    currentTgKey,
    tokenGroupMap,
    tokenBalanceMap,
    tokenBalanceKeyPriceMap,
  );
  const chainTabsNetworkKeys = getChainTabsNetworkKeys(
    isGroupDetail,
    tokenBalanceItems,
    tokenGroupMap,
    showedNetworks,
    accountType,
    isShowZeroBalance,
  );

  const onPressTokenItem = (item: TokenBalanceItemType, info?: AccountInfoByNetwork) => {
    if (isGroupDetail) {
      handleChangeTokenItem(item.symbol, item.displayedSymbol, info);
    } else {
      setCurrentTgKey(item.id);
      setGroupDetail(true);
    }
  };

  const renderNetworkItem = ({ item: networkKey }: ListRenderItemInfo<string>) => {
    const info = accountInfoByNetworkMap[networkKey];
    const balanceInfo = networkBalanceMap[networkKey] || getEmptyBalanceInfo(info.nativeToken);

    if (
      !isShowZeroBalance &&
      !alwaysShowedNetworkKeys.includes(networkKey) &&
      balanceInfo.balanceValue.eq(BN_ZERO) &&
      !checkExistedChildrenBalance(balanceInfo.childrenBalances)
    ) {
      return null;
    }

    return (
      <View key={info.key} style={itemWrapperStyle}>
        <ChainBalance
          accountInfo={info}
          onPress={() => onPressChainItem(info, balanceInfo)}
          balanceInfo={balanceInfo}
        />
        <View style={itemWrapperAppendixStyle} />
      </View>
    );
  };

  const renderTokenTabItem = ({ item }: ListRenderItemInfo<TokenBalanceItemType>) => {
    const info = accountInfoByNetworkMap[item.networkKey];

    if (!isItemAllowedToShow(item, accountType, tokenGroupMap, isShowZeroBalance)) {
      return null;
    }

    return (
      <View key={item.id} style={itemWrapperStyle}>
        <TokenChainBalance onPress={() => onPressTokenItem(item, info)} {...item} />
        <View style={itemWrapperAppendixStyle} />
      </View>
    );
  };

  const renderTabContainerHeader = () => {
    return (
      <TabsContainerHeader
        balanceBlockProps={{
          balanceValue: getBalanceValue(isGroupDetail, currentTgKey, totalBalanceValue, tokenGroupMap, tokenBalanceMap),
        }}
      />
    );
  };

  const _onRefresh = (tabId: string) => {
    setRefreshTabId(tabId);
    refresh(restartSubscriptionServices(['balance']));
  };

  return (
    <ScreenContainer backgroundColor={ColorMap.dark2}>
      <>
        {!isGroupDetail && <Header navigation={navigation} onPressSearchButton={onPressSearchButton} />}
        {isGroupDetail && (
          <SubHeader
            backgroundColor={ColorMap.dark2}
            onPressBack={onPressBack}
            title={getTokenGroupDisplayName(currentTgKey)}
          />
        )}

        <Tabs.Container
          lazy
          containerStyle={{ backgroundColor: ColorMap.dark2 }}
          allowHeaderOverscroll={true}
          renderTabBar={renderTabBar}
          renderHeader={renderTabContainerHeader}>
          <Tabs.Tab name={'one'} label={i18n.title.token}>
            <TokensTab
              items={tokenBalanceItems}
              renderItem={renderTokenTabItem}
              isRefresh={isRefresh}
              refresh={_onRefresh}
              refreshTabId={refreshTabId}
              isEmptyList={isEmptyList(tokenBalanceItems, accountType, tokenGroupMap, isShowZeroBalance)}
            />
          </Tabs.Tab>
          <Tabs.Tab name={'two'} label={i18n.title.network}>
            <ChainsTab
              renderItem={renderNetworkItem}
              networkKeys={chainTabsNetworkKeys}
              isRefresh={isRefresh}
              refresh={_onRefresh}
              refreshTabId={refreshTabId}
              isEmptyList={isEmptyList(tokenBalanceItems, accountType, tokenGroupMap, isShowZeroBalance)}
            />
          </Tabs.Tab>
        </Tabs.Container>
      </>
    </ScreenContainer>
  );
};

export default TokenGroupLayer;
