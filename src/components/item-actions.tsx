import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Checkbox, Chip, SectionHeader } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { JOB_STAGES } from '@/lib/format';
import type { ExtractedFields, Item } from '@/lib/types';

/**
 * The one or two things you'd actually do with this kind of item. Everything here
 * is an explicit tap; nothing connects, calls or pays on its own.
 */
export function ItemActions({ item, onChangeFields }: { item: Item; onChangeFields: (fields: ExtractedFields) => void }) {
  const { fields } = item;
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, value: string) => {
    await Clipboard.setStringAsync(value);
    setCopied(key);
  };
  const copyLabel = (key: string, label: string) => (copied === key ? 'Copied ✓' : label);

  const link = fields.urls?.[0];
  const actions: { key: string; label: string; onPress: () => void }[] = [];

  if (fields.couponCode) {
    actions.push({ key: 'code', label: copyLabel('code', `Copy code ${fields.couponCode}`), onPress: () => copy('code', fields.couponCode!) });
  }
  if (item.type === 'place') {
    const query = [item.title, fields.address].filter(Boolean).join(', ');
    const maps = link && /maps|goo\.gl/i.test(link) ? link : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    actions.push({ key: 'maps', label: 'Open in Maps', onPress: () => Linking.openURL(maps) });
  }
  if (fields.wifi?.password) {
    actions.push({ key: 'wifi', label: copyLabel('wifi', 'Copy Wi-Fi password'), onPress: () => copy('wifi', fields.wifi!.password!) });
    if (Platform.OS === 'android') {
      actions.push({ key: 'wifi-settings', label: 'Open Wi-Fi settings', onPress: () => Linking.sendIntent('android.settings.WIFI_SETTINGS') });
    }
  }
  if (fields.contact?.phone) {
    actions.push({ key: 'call', label: `Call ${fields.contact.phone}`, onPress: () => Linking.openURL(`tel:${fields.contact!.phone}`) });
    actions.push({ key: 'phone', label: copyLabel('phone', 'Copy number'), onPress: () => copy('phone', fields.contact!.phone!) });
  }
  if (fields.upi) {
    actions.push({ key: 'upi', label: copyLabel('upi', 'Copy UPI ID'), onPress: () => copy('upi', fields.upi!.payee) });
  }
  if (link && item.type !== 'place') {
    actions.push({ key: 'link', label: item.type === 'job' ? 'Open job posting' : 'Open link', onPress: () => Linking.openURL(link) });
  }

  return (
    <>
      {item.type === 'job' ? (
        <>
          <SectionHeader title="Stage" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {JOB_STAGES.map((stage) => (
              <Chip
                key={stage.value}
                label={stage.label}
                selected={(fields.stage ?? 'saved') === stage.value}
                onPress={() => onChangeFields({ ...fields, stage: stage.value })}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      {fields.ingredients?.length ? (
        <>
          <SectionHeader
            title="Ingredients"
            trailing={
              <Button
                label={copyLabel('list', 'Copy list')}
                variant="plain"
                size="small"
                onPress={() =>
                  copy(
                    'list',
                    fields.ingredients!.filter((i) => !i.done).map((i) => `• ${i.text}`).join('\n'),
                  )
                }
              />
            }
          />
          {fields.ingredients.map((ingredient, index) => (
            <Checkbox
              key={`${ingredient.text}-${index}`}
              label={ingredient.text}
              selected={ingredient.done}
              strikeWhenChecked
              onPress={() =>
                onChangeFields({
                  ...fields,
                  ingredients: fields.ingredients!.map((i, j) => (j === index ? { ...i, done: !i.done } : i)),
                })
              }
            />
          ))}
        </>
      ) : null}

      {actions.length ? (
        <View style={styles.actions}>
          {actions.map((action) => (
            <Button key={action.key} label={action.label} onPress={action.onPress} />
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.two,
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
});
