import { formatBalance } from '@polkadot/util';
import { SiDef } from '@polkadot/util/types';
import { useNavigation } from '@react-navigation/native';
import BigN from 'bignumber.js';
import { BalanceToUsd } from 'components/BalanceToUsd';
import { ContainerWithSubHeader } from 'components/ContainerWithSubHeader';
import FormatBalance from 'components/FormatBalance';
import { InputBalance } from 'components/Input/InputBalance';
import { SubmitButton } from 'components/SubmitButton';
import { SubWalletAvatar } from 'components/SubWalletAvatar';
import { Warning } from 'components/Warning';
import useFreeBalance from 'hooks/screen/useFreeBalance';
import useGetNetworkJson from 'hooks/screen/useGetNetworkJson';
import React, { createRef, useCallback, useContext, useMemo, useState } from 'react';
import { ScrollView, StyleProp, Text, TextStyle, TouchableOpacity, View, ViewStyle } from 'react-native';
import { RootNavigationProps } from 'routes/index';
import { StakeConfirmProps } from 'routes/staking/stakeAction';
import ValidatorBriefInfo from 'components/Staking/ValidatorBriefInfo';
import { ColorMap } from 'styles/color';
import {
  ContainerHorizontalPadding,
  FontMedium,
  MarginBottomForSubmitButton,
  ScrollViewStyle,
  sharedStyles,
} from 'styles/sharedStyles';
import i18n from 'utils/i18n/i18n';
import { getBondingTxInfo } from '../../../messaging';
import useGetAmountInfo from 'hooks/screen/Staking/useGetAmountInfo';
import { WebRunnerContext } from 'providers/contexts';

const ContainerStyle: StyleProp<ViewStyle> = {
  ...ContainerHorizontalPadding,
  flex: 1,
};

const RowCenterStyle: StyleProp<ViewStyle> = {
  justifyContent: 'center',
  display: 'flex',
  flexDirection: 'row',
  marginBottom: 8,
};

const IconContainerStyle: StyleProp<ViewStyle> = {
  ...RowCenterStyle,
  marginTop: 46,
  marginBottom: 16,
};

const BalanceContainerStyle: StyleProp<ViewStyle> = {
  width: '100%',
  flexDirection: 'row',
  justifyContent: 'space-between',
  paddingTop: 8,
  paddingBottom: 24,
};

const TransferableContainerStyle: StyleProp<ViewStyle> = {
  flexDirection: 'row',
  alignItems: 'center',
};

const TransferableTextStyle: StyleProp<TextStyle> = {
  ...sharedStyles.mainText,
  ...FontMedium,
  color: ColorMap.light,
};

const MaxTextStyle: StyleProp<TextStyle> = {
  color: ColorMap.primary,
  ...sharedStyles.mainText,
  ...FontMedium,
};

const WarningStyle: StyleProp<ViewStyle> = {
  marginBottom: 8,
};

const DEFAULT_AMOUNT = -1;

const StakeConfirm = ({ route: { params: stakeParams }, navigation: { goBack } }: StakeConfirmProps) => {
  const { validator, networkKey, networkValidatorsInfo, selectedAccount } = stakeParams;
  const isNetConnected = useContext(WebRunnerContext).isNetConnected;
  const navigation = useNavigation<RootNavigationProps>();

  const network = useGetNetworkJson(networkKey);

  const inputBalanceRef = createRef();

  const selectedToken = useMemo((): string => network.nativeToken || 'Token', [network.nativeToken]);

  const senderFreeBalance = useFreeBalance(networkKey, selectedAccount, network.nativeToken);

  const { minBond } = validator;
  const { isBondedBefore, bondedValidators } = networkValidatorsInfo;

  const [si, setSi] = useState<SiDef>(formatBalance.findSi('-'));
  const [rawAmount, setRawAmount] = useState<number>(DEFAULT_AMOUNT);
  const [balanceError, setBalanceError] = useState(false);
  const [loading, setLoading] = useState(false);
  const { reformatAmount, amountToUsd, balanceFormat } = useGetAmountInfo(rawAmount, networkKey);

  const warningMessage = useMemo((): string => {
    if (rawAmount === DEFAULT_AMOUNT) {
      return '';
    }

    if (balanceError) {
      return i18n.warningMessage.balanceTooLow;
    }

    const isBoned = !!networkValidatorsInfo.bondedValidators.find(
      address => address.toLowerCase() === validator.address.toLowerCase(),
    );

    if (rawAmount <= 0) {
      if (!isBoned) {
        return `${i18n.warningMessage.stakeAtLeast} ${validator.minBond} ${selectedToken}`;
      } else {
        return i18n.warningMessage.amountGtZero;
      }
    }

    if (parseFloat(senderFreeBalance) <= rawAmount) {
      return i18n.warningMessage.notEnoughToStake;
    }

    if (reformatAmount < minBond) {
      if (isBoned) {
        return '';
      } else {
        return `${i18n.warningMessage.stakeAtLeast} ${validator.minBond} ${selectedToken}`;
      }
    }

    return '';
  }, [
    balanceError,
    minBond,
    networkValidatorsInfo.bondedValidators,
    rawAmount,
    reformatAmount,
    selectedToken,
    senderFreeBalance,
    validator.address,
    validator.minBond,
  ]);

  const canStake = useMemo((): boolean => {
    if (parseFloat(senderFreeBalance) > rawAmount && rawAmount > 0) {
      if (networkValidatorsInfo.bondedValidators.includes(validator.address)) {
        return true;
      } else {
        return reformatAmount >= minBond;
      }
    } else {
      return false;
    }
  }, [
    minBond,
    networkValidatorsInfo.bondedValidators,
    rawAmount,
    reformatAmount,
    senderFreeBalance,
    validator.address,
  ]);

  const handleOpenValidatorDetail = useCallback(() => {
    navigation.navigate('StakeAction', {
      screen: 'StakeValidatorDetail',
      params: stakeParams,
    });
  }, [navigation, stakeParams]);

  const handlePressMax = useCallback(() => {
    getBondingTxInfo({
      networkKey: networkKey,
      nominatorAddress: selectedAccount,
      amount: 0,
      validatorInfo: validator,
      isBondedBefore,
      bondedValidators,
      lockPeriod: 0,
    }).then(res => {
      if (inputBalanceRef && inputBalanceRef.current) {
        // @ts-ignore
        const fee = (res.rawFee as number) || 0;
        const balance = parseFloat(senderFreeBalance);
        // @ts-ignore
        inputBalanceRef.current.onChange((balance - fee * 1.1).toString());
      }
    });
  }, [bondedValidators, selectedAccount, inputBalanceRef, isBondedBefore, networkKey, senderFreeBalance, validator]);

  const onChangeAmount = useCallback((value?: string) => {
    setBalanceError(false);
    if (value === undefined) {
      setRawAmount(0);
      return;
    }
    if (isNaN(parseFloat(value))) {
      setRawAmount(DEFAULT_AMOUNT - 1);
    } else {
      setRawAmount(parseFloat(value));
    }
  }, []);

  const onContinue = useCallback(() => {
    setLoading(true);

    if (!isNetConnected) {
      setLoading(false);
      return;
    }
    getBondingTxInfo({
      networkKey: networkKey,
      nominatorAddress: selectedAccount,
      amount: reformatAmount,
      validatorInfo: validator,
      isBondedBefore,
      bondedValidators,
      lockPeriod: 0,
    })
      .then(res => {
        if (!res.balanceError) {
          navigation.navigate('StakeAction', {
            screen: 'StakeAuth',
            params: {
              stakeParams: stakeParams,
              amount: rawAmount,
              feeString: res.fee,
              amountSi: si,
            },
          });
        } else {
          setBalanceError(true);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [
    isNetConnected,
    networkKey,
    selectedAccount,
    reformatAmount,
    validator,
    isBondedBefore,
    bondedValidators,
    navigation,
    stakeParams,
    rawAmount,
    si,
  ]);

  return (
    <ContainerWithSubHeader
      onPressBack={goBack}
      title={i18n.title.stakeAction}
      rightButtonTitle={i18n.common.cancel}
      disabled={loading}
      disableRightButton={loading}
      onPressRightIcon={goBack}>
      <View style={ContainerStyle}>
        <ScrollView style={{ ...ScrollViewStyle }} contentContainerStyle={{ paddingTop: 16, flexGrow: 1 }}>
          <View style={{ flex: 1, paddingBottom: 16 }}>
            <ValidatorBriefInfo validator={validator} onPress={handleOpenValidatorDetail} disable={loading} />
            <View style={IconContainerStyle}>
              <View>
                <SubWalletAvatar size={40} address={selectedAccount} />
              </View>
            </View>
            <InputBalance
              placeholder={'0'}
              si={si}
              onChangeSi={setSi}
              maxValue={senderFreeBalance}
              onChange={onChangeAmount}
              decimals={balanceFormat[0]}
              ref={inputBalanceRef}
              siSymbol={selectedToken}
              disable={loading}
            />
            <View style={RowCenterStyle}>
              {!!reformatAmount && <BalanceToUsd amountToUsd={new BigN(amountToUsd)} isShowBalance={true} />}
            </View>
          </View>

          {!!warningMessage && <Warning style={WarningStyle} message={warningMessage} isDanger />}

          {!isNetConnected && <Warning isDanger message={i18n.warningMessage.noInternetMessage} />}
        </ScrollView>
        <View>
          <View style={BalanceContainerStyle}>
            <View style={TransferableContainerStyle}>
              <Text style={TransferableTextStyle}>{i18n.common.transferable}</Text>
              <FormatBalance format={balanceFormat} value={senderFreeBalance} />
            </View>

            <TouchableOpacity onPress={handlePressMax} disabled={loading}>
              <Text style={MaxTextStyle}>{i18n.common.max}</Text>
            </TouchableOpacity>
          </View>
          <SubmitButton
            disabled={!canStake || !isNetConnected}
            isBusy={loading}
            title={i18n.common.continue}
            style={{
              width: '100%',
              ...MarginBottomForSubmitButton,
            }}
            onPress={onContinue}
          />
        </View>
      </View>
    </ContainerWithSubHeader>
  );
};

export default React.memo(StakeConfirm);
