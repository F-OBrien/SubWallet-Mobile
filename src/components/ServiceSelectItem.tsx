import React from 'react';
import { StyleProp, TouchableOpacity, View } from 'react-native';
import { getNetworkLogo } from 'utils/index';
import { ColorMap } from 'styles/color';
import Text from 'components/Text';
import { FontSemiBold, sharedStyles } from 'styles/sharedStyles';
import { Divider } from 'components/Divider';

interface Props {
  serviceKey: string;
  serviceName: string;
  url: string;
  onPressItem: () => void;
}

const logoWrapperStyle: StyleProp<any> = {
  backgroundColor: ColorMap.light,
  borderRadius: 14,
};

const itemTextStyle: StyleProp<any> = {
  paddingLeft: 20,
  color: ColorMap.light,
  ...sharedStyles.mediumText,
  ...FontSemiBold,
};

export const ServiceSelectItem = ({ serviceKey, serviceName, onPressItem, url }: Props) => {
  return (
    <TouchableOpacity style={{ opacity: url ? 1 : 0.5 }} onPress={onPressItem}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' }}>
        <View style={logoWrapperStyle}>{getNetworkLogo(serviceKey, 28)}</View>
        <Text style={itemTextStyle}>{serviceName}</Text>
      </View>

      <Divider style={{ paddingLeft: 64, paddingRight: 16 }} color={ColorMap.dark2} />
    </TouchableOpacity>
  );
};
