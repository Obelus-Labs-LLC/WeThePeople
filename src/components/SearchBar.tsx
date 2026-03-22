import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UI_COLORS } from '../constants/colors';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

export default function SearchBar({ value, onChangeText, placeholder = 'Search...', debounceMs = 300 }: SearchBarProps) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { setLocal(value); }, [value]);

  useEffect(() => {
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  const handleChange = useCallback((text: string) => {
    setLocal(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChangeText(text), debounceMs);
  }, [onChangeText, debounceMs]);

  return (
    <View style={styles.container}>
      <Ionicons name="search-outline" size={18} color={UI_COLORS.TEXT_MUTED} style={styles.icon} />
      <TextInput
        style={styles.input}
        value={local}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={UI_COLORS.TEXT_MUTED}
        autoCorrect={false}
        returnKeyType="search"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI_COLORS.CARD_BG,
    borderWidth: 1,
    borderColor: UI_COLORS.BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  icon: { marginRight: 8 },
  input: {
    flex: 1,
    fontSize: 14,
    color: UI_COLORS.TEXT_PRIMARY,
  },
});
