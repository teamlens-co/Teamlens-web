import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import api from '../services/api';
import { AppCard, MiniIcon, ScreenShell } from '../components/IosKit';
import { borderRadius, colors, spacing, typography } from '../theme';
import type { ClassificationRule } from '../types';

const categoryTone = (category: string) => {
  const key = category.toUpperCase();
  if (key === 'PRODUCTIVE') return colors.success;
  if (key === 'UNPRODUCTIVE') return colors.danger;
  return colors.info;
};

export default function ProductivityLabelsScreen() {
  const navigation = useNavigation<any>();
  const [rules, setRules] = useState<ClassificationRule[]>([]);
  const [pattern, setPattern] = useState('');
  const [category, setCategory] = useState<'PRODUCTIVE' | 'NEUTRAL' | 'UNPRODUCTIVE'>('PRODUCTIVE');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const result = await api.getClassificationRules();
    setRules(result.ok && Array.isArray(result.data) ? result.data : []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const save = async () => {
    if (!pattern.trim()) {
      Alert.alert('Pattern required', 'Enter an app, title, or domain pattern.');
      return;
    }
    setSaving(true);
    const result = await api.upsertClassificationRule({
      appPattern: pattern.trim(),
      label: pattern.trim(),
      category,
    });
    setSaving(false);
    if (!result.ok) {
      Alert.alert('Unable to save', result.message || 'Please try again.');
      return;
    }
    setPattern('');
    void load();
  };

  return (
    <ScreenShell>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MiniIcon name="back" color={colors.brand} size={22} />
          <Text style={styles.backText}>Dashboard</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Productivity Labels</Text>
        <Text style={styles.subtitle}>Classify apps and websites from mobile</Text>

        <AppCard style={styles.form}>
          <Text style={styles.formTitle}>Add rule</Text>
          <TextInput
            value={pattern}
            onChangeText={setPattern}
            placeholder="github.com, Slack, YouTube..."
            placeholderTextColor={colors.mutedLight}
            style={styles.input}
            autoCapitalize="none"
          />
          <View style={styles.categoryRow}>
            {(['PRODUCTIVE', 'NEUTRAL', 'UNPRODUCTIVE'] as const).map((item) => {
              const color = categoryTone(item);
              return (
                <TouchableOpacity key={item} onPress={() => setCategory(item)} style={[styles.categoryButton, category === item && { backgroundColor: `${color}18`, borderColor: color }]}>
                  <Text style={[styles.categoryText, category === item && { color }]}>{item.replace('UN', 'UN ')}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity disabled={saving} onPress={save} style={styles.saveButton}>
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>Save rule</Text>}
          </TouchableOpacity>
        </AppCard>

        <Text style={styles.sectionTitle}>Current rules</Text>
        {loading ? (
          <ActivityIndicator color={colors.brand} style={styles.loader} />
        ) : rules.length === 0 ? (
          <AppCard style={styles.empty}><Text style={styles.emptyText}>No custom labels yet.</Text></AppCard>
        ) : (
          rules.map((rule) => {
            const color = categoryTone(rule.category);
            return (
              <AppCard key={rule.id} style={styles.rule}>
                <View style={[styles.ruleIcon, { backgroundColor: `${color}18` }]}>
                  <MiniIcon name="target" color={color} size={18} />
                </View>
                <View style={styles.ruleMain}>
                  <Text style={styles.ruleTitle}>{rule.label || rule.appPattern || rule.domainPattern || 'Rule'}</Text>
                  <Text style={styles.rulePattern}>{rule.appPattern || rule.domainPattern || rule.titlePattern || 'Any pattern'}</Text>
                </View>
                <Text style={[styles.ruleCategory, { color }]}>{rule.category}</Text>
              </AppCard>
            );
          })
        )}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.md, marginLeft: -4 },
  backText: { ...typography.bodySm, color: colors.brand, fontWeight: '600' },
  title: { ...typography.h1, marginBottom: 4 },
  subtitle: { ...typography.bodySm, color: colors.muted, marginBottom: spacing.lg },
  form: { padding: spacing.md, marginBottom: spacing.xl },
  formTitle: { ...typography.h3, marginBottom: spacing.md },
  input: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: 12, color: colors.text, fontSize: 15, marginBottom: spacing.md },
  categoryRow: { gap: spacing.sm, marginBottom: spacing.md },
  categoryButton: { borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingVertical: 10, alignItems: 'center' },
  categoryText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  saveButton: { backgroundColor: colors.brand, borderRadius: borderRadius.md, paddingVertical: 13, alignItems: 'center' },
  saveText: { color: colors.white, fontWeight: '600' },
  sectionTitle: { ...typography.h3, marginBottom: spacing.sm },
  loader: { marginTop: spacing.xl },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { ...typography.bodySm, color: colors.muted },
  rule: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md, marginBottom: spacing.sm },
  ruleIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ruleMain: { flex: 1 },
  ruleTitle: { ...typography.bodySm, fontWeight: '600' },
  rulePattern: { ...typography.caption },
  ruleCategory: { fontSize: 10, fontWeight: '600' },
});
