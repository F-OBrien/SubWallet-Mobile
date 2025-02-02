import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleProp, Text } from 'react-native';
import { FontMedium, sharedStyles } from 'styles/sharedStyles';
import { ColorMap } from 'styles/color';
import { filterNotReadOnlyAccount } from 'utils/account';
import i18n from 'utils/i18n/i18n';
import { filterAndSortingAccountByAuthType, isValidSubstrateAddress } from '@subwallet/extension-koni-base/utils';
import { useSelector } from 'react-redux';
import { RootState } from 'stores/index';
import { AuthorizeRequest } from '@subwallet/extension-base/background/types';
import { ConnectAccount } from 'components/ConnectAccount';
import { ALL_ACCOUNT_KEY } from '@subwallet/extension-koni-base/constants';
import { Warning } from 'components/Warning';
import { ConfirmationHookType } from 'hooks/types';
import { ConfirmationBase } from 'screens/Home/Browser/ConfirmationPopup/ConfirmationBase';
import { isEthereumAddress } from '@polkadot/util-crypto';

interface Props {
  payload: AuthorizeRequest;
  cancelRequest: ConfirmationHookType['cancelRequest'];
  approveRequest: ConfirmationHookType['approveRequest'];
  rejectRequest: ConfirmationHookType['rejectRequest'];
}

const textStyle: StyleProp<any> = {
  ...sharedStyles.mainText,
  ...FontMedium,
  color: ColorMap.disabled,
};

const CONFIRMATION_TYPE = 'authorizeRequest';

export const AuthorizeConfirmation = ({
  payload: { request, id: confirmationId, url },
  cancelRequest,
  approveRequest,
  rejectRequest,
}: Props) => {
  const { accountAuthType } = request;
  const accounts = useSelector((state: RootState) => state.accounts.accounts);
  const accountList = useMemo(() => {
    return filterNotReadOnlyAccount(filterAndSortingAccountByAuthType(accounts, accountAuthType || 'substrate', true));
  }, [accountAuthType, accounts]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(request.allowedAccounts || []);
  const [isSelectedAll, setIsSelectedAll] = useState(true);
  const selectedAccountByType =
    accountAuthType === 'evm'
      ? selectedAccounts.filter(item => isEthereumAddress(item))
      : selectedAccounts.filter(item => isValidSubstrateAddress(item));

  useEffect(() => {
    const notInSelected = accountList.find(acc => !selectedAccounts.includes(acc.address));
    setIsSelectedAll(!notInSelected);
  }, [accountList, selectedAccounts]);

  const onPressCancelButton = () => {
    return cancelRequest(CONFIRMATION_TYPE, confirmationId);
  };

  const onPressSubmitButton = () => {
    return approveRequest(CONFIRMATION_TYPE, confirmationId, { data: selectedAccounts });
  };

  const onPressBlockButton = () => {
    return rejectRequest(CONFIRMATION_TYPE, confirmationId);
  };

  const onChangeSelection = (address: string) => {
    let newSelectedList = accountList.map(account => account.address);

    if (address !== ALL_ACCOUNT_KEY) {
      if (selectedAccounts.includes(address)) {
        newSelectedList = selectedAccounts.filter(acc => acc !== address);
      } else {
        newSelectedList = selectedAccounts.concat(address);
      }
    } else if (isSelectedAll) {
      newSelectedList = [];
    }

    setSelectedAccounts(newSelectedList);
  };

  return (
    <ConfirmationBase
      headerProps={{
        title: i18n.title.authorizeRequestTitle,
        url,
      }}
      isUseScrollView={false}
      footerProps={{
        isShowBlockButton: true,
        cancelButtonTitle: i18n.common.cancel,
        submitButtonTitle: i18n.common.connect,
        onPressCancelButton: onPressCancelButton,
        onPressSubmitButton: onPressSubmitButton,
        onPressBlockButton: onPressBlockButton,
        isSubmitButtonDisabled: !(selectedAccountByType && selectedAccountByType.length),
      }}
      isShowViewDetailButton={false}>
      <>
        {accountList && accountList.length ? (
          <>
            <Text style={[textStyle, { paddingBottom: 16, width: '100%', paddingLeft: 16, paddingTop: 24 }]}>
              {i18n.common.chooseAccount}
            </Text>
            <ScrollView
              style={{ maxHeight: 180, width: '100%', paddingHorizontal: 16 }}
              showsVerticalScrollIndicator={false}>
              <>
                <ConnectAccount
                  isSelected={isSelectedAll}
                  address={ALL_ACCOUNT_KEY}
                  name={i18n.common.selectAll}
                  selectedAccounts={accountList.map(account => account.address)}
                  onChangeSelection={onChangeSelection}
                />
                {accountList.map(acc => (
                  <ConnectAccount
                    key={acc.address}
                    isSelected={selectedAccounts.includes(acc.address)}
                    address={acc.address}
                    name={acc.name || ''}
                    selectedAccounts={selectedAccounts}
                    onChangeSelection={onChangeSelection}
                  />
                ))}
              </>
            </ScrollView>
          </>
        ) : (
          <Warning
            style={{ marginHorizontal: 16, marginTop: 16 }}
            message={
              accountAuthType === 'evm'
                ? i18n.warningMessage.noEvmAccountMessage
                : i18n.warningMessage.noSubstrateAccountMessage
            }
          />
        )}

        <Text style={[textStyle, { paddingTop: 8, paddingBottom: 32, width: '100%', paddingLeft: 16 }]}>
          {i18n.warningMessage.trustSiteMessage}
        </Text>
      </>
    </ConfirmationBase>
  );
};
