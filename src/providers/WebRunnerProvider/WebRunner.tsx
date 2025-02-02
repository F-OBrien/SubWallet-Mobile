// Create web view with solution suggested in https://medium0.com/@caphun/react-native-load-local-static-site-inside-webview-2b93eb1c4225
import { Alert, AppState, Linking, NativeSyntheticEvent, Platform, View } from 'react-native';
import EventEmitter from 'eventemitter3';
import React, { useReducer } from 'react';
import WebView from 'react-native-webview';
import { WebViewMessage } from 'react-native-webview/lib/WebViewTypes';
import { WebRunnerState, WebRunnerStatus } from 'providers/contexts';
import StaticServer from 'react-native-static-server';
import {
  initCronAndSubscription,
  listenMessage,
  resetHandlerMaps,
  startCronAndSubscriptionServices,
  startCronServices,
  startSubscriptionServices,
} from '../../messaging';
import { Message } from '@subwallet/extension-base/types';
import RNFS from 'react-native-fs';
import i18n from 'utils/i18n/i18n';
import { DelayBackgroundService } from 'types/background';
import VersionNumber from 'react-native-version-number';
import { getId } from '@subwallet/extension-base/utils/getId';

const WEB_SERVER_PORT = 9135;
const LONG_TIMEOUT = 900000; //15*60*1000
const ACCEPTABLE_RESPONSE_TIME = 30000;

const getJsInjectContent = (showLog?: boolean) => {
  let injectedJS = `
  // Update config data
  setTimeout(() => {
    var info = {
      url: window.location.href,
      version: JSON.parse(localStorage.getItem('application') || '{}').version,
      userAgent: navigator.userAgent
    }
  
    window.ReactNativeWebView.postMessage(JSON.stringify({id: '-1', 'response': info }))
  }, 300);
`;
  // Show webview log in development environment
  if (showLog) {
    injectedJS += `
  const consoleLog = (type, args) => window.ReactNativeWebView.postMessage(JSON.stringify({id: '-2', 'response': [type, ...args]}));
  console = {
      log: (...args) => consoleLog('log', [...args]),
      debug: (...args) => consoleLog('debug', [...args]),
      info: (...args) => consoleLog('info', [...args]),
      warn: (...args) => consoleLog('warn', [...args]),
      error: (...args) => consoleLog('error', [...args]),
  };`;
  }

  return injectedJS;
};

function setupBackgroundService(
  clearBackgroundServiceTimeout: (service: DelayBackgroundService) => void,
  setBackgroundServiceTimeout: (service: DelayBackgroundService, timeout: NodeJS.Timeout) => void,
) {
  initCronAndSubscription({
    subscription: {
      activeServices: ['chainRegistry', 'balance'],
    },
    cron: {
      intervalMap: {
        recoverApiMap: 20000,
        checkApiMapStatus: 5000,
        refreshHistory: 60000,
        refreshNft: 60000,
        refreshPrice: 30000,
        refreshStakeUnlockingInfo: 60000,
        refreshStakingReward: 60000,
      },
      activeServices: ['price', 'history', 'recoverApi', 'checkApiStatus'],
    },
  }).catch(e => {
    console.log('Init background services error', e);
  });

  clearBackgroundServiceTimeout('crowdloan');
  clearBackgroundServiceTimeout('staking');
  clearBackgroundServiceTimeout('nft');
  setBackgroundServiceTimeout(
    'crowdloan',
    setTimeout(() => {
      startSubscriptionServices(['crowdloan']).catch(e => console.log('Init crowdloan service error', e));
    }, 2000),
  );
  setBackgroundServiceTimeout(
    'staking',
    setTimeout(() => {
      startCronAndSubscriptionServices({ cronServices: ['staking'], subscriptionServices: ['staking'] }).catch(e =>
        console.log('Init staking services error', e),
      );
    }, 4000),
  );
  setBackgroundServiceTimeout(
    'nft',
    setTimeout(() => {
      startCronServices(['nft']).catch(e => console.log('Init nft service error', e));
    }, 6000),
  );
}

function isWebRunnerAlive(eventData: NativeSyntheticEvent<WebViewMessage>): boolean {
  try {
    const data = JSON.parse(eventData.nativeEvent.data);

    return (
      !!data.id &&
      !['0', '-1', '-2'].includes(data.id) &&
      (data.response !== undefined || data.subscription !== undefined)
    );
  } catch (e) {
    return false;
  }
}

class WebRunnerHandler {
  eventEmitter?: EventEmitter;
  webRef?: React.RefObject<WebView<{}>>;
  server?: StaticServer;
  state?: WebRunnerGlobalState;
  runnerState: WebRunnerState = {};
  lastTimeResponse?: number;
  lastActiveTime?: number;
  pingTimeout?: NodeJS.Timeout;
  outOfResponseTimeTimeout?: NodeJS.Timeout;
  pingInterval?: NodeJS.Timer;
  status: 'inactive' | 'activating' | 'active' = 'inactive';
  dispatch?: React.Dispatch<WebRunnerControlAction>;

  update(globalState: WebRunnerGlobalState, dispatch: React.Dispatch<WebRunnerControlAction>) {
    this.state = globalState;
    this.runnerState = globalState.stateRef.current || {};
    this.webRef = globalState.runnerRef;
    this.eventEmitter = globalState.eventEmitter;
    this.dispatch = dispatch;
  }

  ping() {
    this.webRef?.current?.injectJavaScript(
      `window.postMessage(${JSON.stringify({
        id: getId(),
        message: 'mobile(ping)',
        request: null,
        origin: undefined,
      })})`,
    );
  }

  reload() {
    this.eventEmitter?.emit('update-status', 'reloading');
    resetHandlerMaps();
    this.webRef?.current?.reload();
  }

  pingCheck(timeCheck: number = 999, timeout = 6666, maxRetry = 3) {
    const flag = {
      retry: 0,
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const check = () => {
      this.pingTimeout && clearTimeout(this.pingTimeout);

      this.pingTimeout = setTimeout(() => {
        const offsetTime = this.lastTimeResponse ? new Date().getTime() - this.lastTimeResponse : 0;
        if (offsetTime > timeout || offsetTime === 0) {
          if (flag.retry < maxRetry) {
            this.ping();
            check();
            flag.retry += 1;
          } else {
            this.reload();
            console.warn('Reload the web-runner!!!');
          }
        } else {
          flag.retry = 0;
        }
      }, timeCheck);
    };

    check();
  }

  startPing(pingInterval: number = 9999, timeCheck: number = 999, pingTimeout: number = 6666) {
    this.stopPing();
    this.lastTimeResponse = undefined;
    this.pingInterval && clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      this.ping();
      this.pingCheck(timeCheck, pingTimeout);
    }, pingInterval);

    // this.startPingCheck(timeout, directTimeCheck);
  }

  stopPing() {
    this.pingInterval && clearInterval(this.pingInterval);
    this.pingTimeout && clearTimeout(this.pingTimeout);
    this.clearOutOfResponseTimeTimeout();
  }

  clearOutOfResponseTimeTimeout() {
    this.outOfResponseTimeTimeout && clearTimeout(this.outOfResponseTimeTimeout);
  }

  async serverReady() {
    // No need server for android => this logic is same with isAndroid
    if (!this.server) {
      return true;
    }

    const isRunning = await this.server.isRunning();
    if (!isRunning) {
      await this.server.start();
    }
    return true;
  }

  active() {
    if (this.status === 'inactive') {
      this.status = 'activating';
      this.serverReady()
        .then(() => {
          this.dispatch && this.dispatch({ type: 'active' });
          this.status = 'active';
        })
        .catch(console.error);
    }
  }

  sleep() {
    this.stopPing();
    this.dispatch && this.dispatch({ type: 'sleep' });
    this.status = 'inactive';
  }

  rerender() {
    this.dispatch && this.dispatch({ type: 'rerender' });
  }

  onRunnerMessage(
    eventData: NativeSyntheticEvent<WebViewMessage>,
    clearBackgroundServiceTimeout: (service: DelayBackgroundService) => void,
    setBackgroundServiceTimeout: (service: DelayBackgroundService, timeout: NodeJS.Timeout) => void,
  ) {
    if (isWebRunnerAlive(eventData)) {
      this.clearOutOfResponseTimeTimeout();

      if (AppState.currentState === 'active') {
        // Save the lastTimeResponse to check it later
        this.lastTimeResponse = new Date().getTime();

        this.outOfResponseTimeTimeout = setTimeout(() => {
          this.eventEmitter?.emit('update-status', 'out_of_response_time');
        }, ACCEPTABLE_RESPONSE_TIME);
      }
    }

    listenMessage(JSON.parse(eventData.nativeEvent.data), this.eventEmitter, (unHandleData: Message['data']) => {
      if (!this.runnerState) {
        this.runnerState = {};
      }
      const { id, response } = unHandleData as { id: string; response: Object };
      if (id === '0') {
        const statusData = response as { status: WebRunnerStatus };
        const webViewStatus = statusData?.status;

        this.runnerState.status = webViewStatus;
        this.eventEmitter?.emit('update-status', webViewStatus);
        console.debug(`### Web Runner Status: ${webViewStatus}`);
        if (webViewStatus === 'crypto_ready') {
          setupBackgroundService(clearBackgroundServiceTimeout, setBackgroundServiceTimeout);
          this.startPing();
        } else {
          this.stopPing();
        }

        return true;
      } else if (id === '-1') {
        const info = response as { url: string; version: string; userAgent: string };
        console.debug('### Web Runner Info:', info);
        this.runnerState.url = info.url;
        this.runnerState.version = info.version;
        this.runnerState.userAgent = info.userAgent;
        if (Platform.OS === 'android') {
          const renderWarningAlert = () => {
            Alert.alert(i18n.warningTitle.warning, i18n.common.useDeviceHaveGooglePlayStore, [
              {
                text: i18n.common.ok,
                onPress: renderWarningAlert,
              },
            ]);
          };

          const renderUpdateAndroidSystemWebView = () => {
            Alert.alert(i18n.warningTitle.warning, i18n.common.pleaseUpdateAndroidSystemWebView, [
              {
                text: i18n.common.ok,
                onPress: () => {
                  renderUpdateAndroidSystemWebView();
                  Linking.canOpenURL('market://details?id=com.google.android.webview')
                    .then(() => Linking.openURL('market://details?id=com.google.android.webview'))
                    .catch(() => renderWarningAlert());
                },
              },
            ]);
          };

          const chromeVersionStr = info.userAgent.split(' ').find(item => item.startsWith('Chrome'));
          const chromeVersion = chromeVersionStr?.split('/')[1].split('.')[0];
          if (chromeVersion && Number(chromeVersion) < 74) {
            renderUpdateAndroidSystemWebView();
          }
        }

        return true;
      } else if (id === '-2') {
        console.debug('### Web Runner Console:', ...(response as any[]));
        return true;
      } else if (response === 'mobile:ping') {
        console.debug('### Web Runner Ping', this.lastTimeResponse);
        return true;
      } else {
        return false;
      }
    });
  }

  constructor() {
    if (Platform.OS === 'ios') {
      this.server = new StaticServer(WEB_SERVER_PORT, RNFS.MainBundlePath + '/Web.bundle', { localOnly: true });
    }
    AppState.addEventListener('change', (state: string) => {
      const now = new Date().getTime();
      if (state === 'active') {
        if (this.lastActiveTime && now - this.lastActiveTime > LONG_TIMEOUT) {
          this.reload();
        } else if (this.runnerState.status === 'crypto_ready') {
          this.ping();
          this.pingCheck(999, 6666, 0);
          this.startPing();
        } else {
          setTimeout(() => {
            this.ping();
            this.pingCheck(999, 6666, 0);
            this.startPing();
          }, 9999);
        }
      } else {
        this.lastActiveTime = now;
        this.stopPing();
      }
    });
  }
}

const webRunnerHandler = new WebRunnerHandler();

interface WebRunnerGlobalState {
  uri?: string;
  injectScript: string;
  runnerRef: React.RefObject<WebView<{}>>;
  stateRef: React.RefObject<WebRunnerState>;
  eventEmitter: EventEmitter;
}

interface WebRunnerControlAction {
  type: string;
  payload?: Partial<WebRunnerGlobalState>;
}

const now = new Date().getTime();

const URI_PARAMS =
  '?platform=' + Platform.OS + `&version=${VersionNumber.appVersion}&build=${VersionNumber.buildVersion}&time=${now}`;
const BASE_URI =
  Platform.OS === 'android' ? 'file:///android_asset/Web.bundle/site' : `http://localhost:${WEB_SERVER_PORT}/site`;

const webRunnerReducer = (state: WebRunnerGlobalState, action: WebRunnerControlAction): WebRunnerGlobalState => {
  const { type } = action;

  switch (type) {
    case 'rerender':
      state.eventEmitter?.emit('update-status', 'reloading');
      if (state.stateRef.current) {
        state.stateRef.current.status = 'reloading';
      }
      state.eventEmitter.emit('reloading');
      return { ...state };
    case 'active':
      const targetURI = `${BASE_URI}/index.html${URI_PARAMS}`;
      return { ...state, uri: targetURI };
    case 'sleep':
      state.uri = undefined;
      state.eventEmitter?.emit('update-status', 'sleep');
      if (state.stateRef.current) {
        state.stateRef.current.status = 'sleep';
        state.stateRef.current.url = '';
        state.stateRef.current.version = '';
      }
      state.eventEmitter.emit('sleep');
      return { ...state };
  }

  return state;
};

interface Props {
  webRunnerRef: React.RefObject<WebView<{}>>;
  webRunnerStateRef: React.RefObject<WebRunnerState>;
  webRunnerEventEmitter: EventEmitter;
  clearBackgroundServiceTimeout: (service: DelayBackgroundService) => void;
  setBackgroundServiceTimeout: (service: DelayBackgroundService, timeout: NodeJS.Timeout) => void;
}

export const WebRunner = React.memo(
  ({
    webRunnerRef,
    webRunnerStateRef,
    webRunnerEventEmitter,
    clearBackgroundServiceTimeout,
    setBackgroundServiceTimeout,
  }: Props) => {
    const [runnerGlobalState, dispatchRunnerGlobalState] = useReducer(webRunnerReducer, {
      injectScript: getJsInjectContent(),
      runnerRef: webRunnerRef,
      stateRef: webRunnerStateRef,
      eventEmitter: webRunnerEventEmitter,
    });

    webRunnerHandler.update(runnerGlobalState, dispatchRunnerGlobalState);
    webRunnerHandler.active();

    const onMessage = (eventData: NativeSyntheticEvent<WebViewMessage>) => {
      webRunnerHandler.onRunnerMessage(eventData, clearBackgroundServiceTimeout, setBackgroundServiceTimeout);
    };

    return (
      <View style={{ height: 0 }}>
        {runnerGlobalState.uri && (
          <WebView
            ref={webRunnerRef}
            source={{ uri: runnerGlobalState.uri }}
            onMessage={onMessage}
            originWhitelist={['*']}
            injectedJavaScript={runnerGlobalState.injectScript}
            onError={e => console.debug('### WebRunner error', e)}
            onHttpError={e => console.debug('### WebRunner HttpError', e)}
            javaScriptEnabled={true}
            allowFileAccess={true}
            allowUniversalAccessFromFileURLs={true}
            allowFileAccessFromFileURLs={true}
            domStorageEnabled={true}
          />
        )}
      </View>
    );
  },
);
