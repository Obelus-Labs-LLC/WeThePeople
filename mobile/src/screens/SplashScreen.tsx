import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');
const BAR_WIDTH = width * 0.55;

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const barProgress = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Track unmount so the chained `.start(() => ...)` callbacks don't
    // call `onFinish` after the parent has already swapped us out
    // (e.g. fast-path AsyncStorage resolved). React StrictMode also
    // runs effects twice, which used to surface a "setState on
    // unmounted component" warning here.
    let cancelled = false;

    const fadeIn = Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    });
    const bar = Animated.timing(barProgress, {
      toValue: 1,
      duration: 2200,
      useNativeDriver: false,
    });
    const fade = Animated.timing(fadeOut, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    });

    fadeIn.start();
    bar.start(() => {
      if (cancelled) return;
      fade.start(() => {
        if (cancelled) return;
        onFinish();
      });
    });

    return () => {
      cancelled = true;
      // Stop in-flight animations so they don't fight a remount.
      fadeIn.stop();
      bar.stop();
      fade.stop();
    };
  }, []);

  const barWidth = barProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BAR_WIDTH],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      {/* Obelus Labs logo */}
      <Animated.View style={[styles.logoContainer, { opacity: fadeAnim }]}>
        <Image
          source={require('../../assets/obelus-logo.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <Text style={styles.companyName}>OBELUS LABS</Text>
      </Animated.View>

      {/* App name */}
      <Animated.View style={[styles.appNameContainer, { opacity: fadeAnim }]}>
        <Text style={styles.appName}>We The People</Text>
        <Text style={styles.appTagline}>Accountability Platform</Text>
      </Animated.View>

      {/* Loading bar */}
      <View style={styles.barContainer}>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { width: barWidth }]}>
            <LinearGradient
              colors={['#1B7A3D', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.barGradient}
            />
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1117',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoImage: {
    width: 100,
    height: 100,
    borderRadius: 20,
    marginBottom: 16,
  },
  companyName: {
    color: '#F5F0E1',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 3,
  },
  appNameContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  appName: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  appTagline: {
    color: '#6B7F8A',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 1,
  },
  barContainer: {
    position: 'absolute',
    bottom: 100,
    alignItems: 'center',
  },
  barTrack: {
    width: BAR_WIDTH,
    height: 4,
    backgroundColor: '#1E2A32',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barGradient: {
    flex: 1,
  },
});
