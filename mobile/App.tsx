import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UI_COLORS } from './src/constants/colors';
import TabNavigator from './src/navigation/TabNavigator';
import SplashScreen from './src/screens/SplashScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import ErrorBoundary from './src/components/ErrorBoundary';

const ONBOARDING_KEY = '@wtp_onboarding_seen';

const navTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: UI_COLORS.ACCENT,
    background: UI_COLORS.PRIMARY_BG,
    card: UI_COLORS.CARD_BG,
    text: UI_COLORS.TEXT_PRIMARY,
    border: UI_COLORS.BORDER,
    notification: '#DC2626',
  },
};

type AppPhase = 'splash' | 'onboarding' | 'app';

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('splash');
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);
  // Splash's animation can finish before AsyncStorage resolves on a cold
  // start; this flag remembers that and defers the transition so we never
  // accidentally skip the onboarding screen for a first-time user.
  const [splashReady, setSplashReady] = useState(false);

  // Check if onboarding was already completed
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((val) => setOnboardingSeen(val === 'true'))
      .catch(() => setOnboardingSeen(false));
  }, []);

  // If splash finished before AsyncStorage resolved, complete the transition
  // as soon as onboardingSeen becomes known.
  useEffect(() => {
    if (phase !== 'splash' || !splashReady || onboardingSeen === null) return;
    setPhase(onboardingSeen ? 'app' : 'onboarding');
  }, [splashReady, onboardingSeen, phase]);

  const handleSplashFinish = () => {
    setSplashReady(true);
    if (onboardingSeen === null) return; // wait for storage
    setPhase(onboardingSeen ? 'app' : 'onboarding');
  };

  const handleOnboardingFinish = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    } catch {}
    setOnboardingSeen(true);
    setPhase('app');
  };

  // Splash screen (always shows first)
  if (phase === 'splash') {
    return (
      <>
        <StatusBar style="light" />
        <SplashScreen onFinish={handleSplashFinish} />
      </>
    );
  }

  // Onboarding (first-time only)
  if (phase === 'onboarding') {
    return (
      <>
        <StatusBar style="light" />
        <OnboardingScreen onFinish={handleOnboardingFinish} />
      </>
    );
  }

  // Main app
  return (
    <ErrorBoundary tag="App">
      <NavigationContainer theme={navTheme}>
        <StatusBar style="light" />
        <TabNavigator />
      </NavigationContainer>
    </ErrorBoundary>
  );
}
