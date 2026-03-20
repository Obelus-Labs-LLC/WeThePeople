import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';

const { width } = Dimensions.get('window');

interface OnboardingProps {
  onFinish: () => void;
}

interface Slide {
  id: string;
  icon: string;
  ionicon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  description: string;
  gradientStart: string;
  gradientEnd: string;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    icon: '🏛️',
    ionicon: 'earth-outline',
    title: 'Welcome to\nWe The People',
    subtitle: 'Public Accountability Platform',
    description:
      'Track what the powerful actually do across politics, finance, health, technology, and energy — all from public record data. No spin. No editorials.',
    gradientStart: '#1B7A3D',
    gradientEnd: '#10B981',
  },
  {
    id: '2',
    icon: '📊',
    ionicon: 'grid-outline',
    title: 'Five Sectors\nOne Platform',
    subtitle: 'All Live Now',
    description:
      'Politics tracks all 535+ members of Congress. Finance monitors banks via SEC and FDIC. Health covers FDA safety data. Tech tracks patents and lobbying. Energy follows oil, gas, and utilities.',
    gradientStart: '#2563EB',
    gradientEnd: '#6366F1',
  },
  {
    id: '3',
    icon: '🎯',
    ionicon: 'analytics-outline',
    title: 'Real Data\nReal Sources',
    subtitle: '24+ Federal Data Sources',
    description:
      'Every data point comes from official public APIs: Congress.gov, SEC EDGAR, FDA, USPTO, CFPB, and more. Tap any entry to see its source and evidence.',
    gradientStart: '#C5960C',
    gradientEnd: '#D4A017',
  },
  {
    id: '4',
    icon: '👤',
    ionicon: 'people-outline',
    title: 'Deep Dive\non Anyone',
    subtitle: 'Profiles & Records',
    description:
      'View any Congress member\'s full bill history, campaign finance data, and policy areas. Browse institutions, pharma companies, and tech giants the same way.',
    gradientStart: '#7C3AED',
    gradientEnd: '#A855F7',
  },
  {
    id: '5',
    icon: '🚀',
    ionicon: 'rocket-outline',
    title: 'Get\nStarted',
    subtitle: 'Built by Obelus Labs',
    description:
      'Start with any sector from the home screen. The public record belongs to the public — we just make it easier to read.',
    gradientStart: '#1B7A3D',
    gradientEnd: '#059669',
  },
];

export default function OnboardingScreen({ onFinish }: OnboardingProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems[0]) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const goNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      onFinish();
    }
  };

  const goSkip = () => {
    onFinish();
  };

  const renderSlide = ({ item, index }: { item: Slide; index: number }) => (
    <View style={styles.slide}>
      {/* Gradient circle icon */}
      <LinearGradient
        colors={[item.gradientStart, item.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.iconCircle}
      >
        <Text style={styles.iconEmoji}>{item.icon}</Text>
      </LinearGradient>

      {/* Title */}
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.subtitle}>{item.subtitle}</Text>

      {/* Description */}
      <Text style={styles.description}>{item.description}</Text>
    </View>
  );

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      {/* Skip button */}
      {!isLast && (
        <TouchableOpacity style={styles.skipBtn} onPress={goSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Slide carousel */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewConfig}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={32}
      />

      {/* Bottom section: dots + button */}
      <View style={styles.bottomSection}>
        {/* Pagination dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, idx) => {
            const inputRange = [(idx - 1) * width, idx * width, (idx + 1) * width];
            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            const dotOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={idx}
                style={[
                  styles.dot,
                  { width: dotWidth, opacity: dotOpacity },
                ]}
              />
            );
          })}
        </View>

        {/* Action button */}
        <TouchableOpacity
          style={[styles.nextBtn, isLast && styles.nextBtnFinal]}
          onPress={goNext}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={isLast ? ['#1B7A3D', '#059669'] : ['#1B7A3D', '#10B981']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.nextBtnGradient}
          >
            <Text style={styles.nextBtnText}>
              {isLast ? 'Get Started' : 'Next'}
            </Text>
            <Ionicons
              name={isLast ? 'arrow-forward' : 'chevron-forward'}
              size={18}
              color="#FFFFFF"
            />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.PRIMARY_BG,
  },
  skipBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skipText: {
    color: UI_COLORS.TEXT_MUTED,
    fontSize: 15,
    fontWeight: '600',
  },
  slide: {
    width,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 36,
    paddingBottom: 120,
  },
  iconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  iconEmoji: {
    fontSize: 48,
  },
  title: {
    color: UI_COLORS.TEXT_PRIMARY,
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: UI_COLORS.ACCENT,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  description: {
    color: UI_COLORS.TEXT_SECONDARY,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
  },
  bottomSection: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 24,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: UI_COLORS.ACCENT,
  },
  nextBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    minWidth: 160,
  },
  nextBtnFinal: {
    minWidth: 200,
  },
  nextBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
