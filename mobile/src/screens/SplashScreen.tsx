import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
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
    // Fade in logo + text
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    // Animate loading bar
    Animated.timing(barProgress, {
      toValue: 1,
      duration: 2200,
      useNativeDriver: false,
    }).start(() => {
      // Fade out then call onFinish
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => onFinish());
    });
  }, []);

  const barWidth = barProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BAR_WIDTH],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      {/* Obelus Labs logo — stylized obelisk */}
      <Animated.View style={[styles.logoContainer, { opacity: fadeAnim }]}>
        <LinearGradient
          colors={['#0EA5A0', '#0D8A86']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.obelisk}
        >
          <View style={styles.obeliskInner}>
            <View style={styles.obeliskTop} />
            <View style={styles.obeliskBody} />
          </View>
        </LinearGradient>

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
  obelisk: {
    width: 72,
    height: 72,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  obeliskInner: {
    alignItems: 'center',
  },
  obeliskTop: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#F5F0E1',
  },
  obeliskBody: {
    width: 12,
    height: 22,
    backgroundColor: '#F5F0E1',
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
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
