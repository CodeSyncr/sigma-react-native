import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, FlatList, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, View} from 'react-native';
import {SigmaSheet, SigmaSheetHandle} from 'rn-sigma';

// The demo keeps a test key on the device so it runs on its own. A real app
// keeps the key on its server and asks the server for links.
const DEFAULT_CLOUD = 'http://localhost:3333';

type Doc = {id: number; title: string; filename: string};

async function api(cloud: string, key: string, path: string, init?: RequestInit) {
  const res = await fetch(`${cloud}/api/v1/sigma/${path}`, {
    ...init,
    headers: {Authorization: `Bearer ${key}`, Accept: 'application/json', ...(init?.headers ?? {})},
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Nimbus Cloud answered ${res.status}`);
  return body;
}

export default function App() {
  const [cloud, setCloud] = useState(DEFAULT_CLOUD);
  const [key, setKey] = useState('');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [status, setStatus] = useState('Enter a Sigma key (sgm_test_…).');
  const [open, setOpen] = useState<Doc | null>(null);

  const refresh = useCallback(async () => {
    if (!key) return;
    setStatus('Loading…');
    try {
      const body = await api(cloud, key, 'documents');
      setDocs(body.documents);
      setStatus(`${body.documents.length} sheets`);
    } catch (e: any) {
      setStatus(e.message);
    }
  }, [cloud, key]);

  useEffect(() => { void refresh(); }, [refresh]);

  const sample = async () => {
    try {
      const doc = await api(cloud, key, 'documents?mode=edit', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title: 'RN budget', blank: 'xlsx'}),
      });
      setOpen(doc);
    } catch (e: any) {
      setStatus(e.message);
    }
  };

  if (open) {
    return <Sheet doc={open} cloud={cloud} apiKey={key} onClose={() => { setOpen(null); void refresh(); }} />;
  }

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar barStyle="dark-content" />
      <Text style={s.h1}>Sigma sheets</Text>
      <TextInput style={s.input} value={cloud} onChangeText={setCloud} autoCapitalize="none" placeholder="Nimbus Cloud address" />
      <TextInput style={s.input} value={key} onChangeText={setKey} autoCapitalize="none" placeholder="sgm_test_…" testID="key" />
      <View style={s.row}>
        <Button title="Refresh" onPress={refresh} />
        <Button title="New sheet" onPress={sample} />
      </View>
      <Text style={s.muted}>{status}</Text>
      <FlatList
        data={docs}
        keyExtractor={d => String(d.id)}
        renderItem={({item}) => (
          <Pressable style={s.item} onPress={() => setOpen(item)}>
            <Text style={s.title}>{item.title || item.filename}</Text>
            <Text style={s.muted}>{item.filename} · #{item.id}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function Sheet({doc, cloud, apiKey, onClose}: {doc: Doc; cloud: string; apiKey: string; onClose: () => void}) {
  const sheet = useRef<SigmaSheetHandle>(null);
  const [state, setState] = useState('opening');

  // In a real app: fetch(`${yourServer}/sheets/${doc.id}/link`), which mints it with the key.
  const link = useCallback(async () => (await api(cloud, apiKey, `documents/${doc.id}/link?mode=edit`, {method: 'POST'})).url, [cloud, apiKey, doc.id]);

  const exportFile = async () => {
    try {
      const f = await sheet.current!.export('xlsx');
      Alert.alert('Exported', `${f.filename}: ${Math.round((f.base64.length * 3) / 4)} bytes`);
    } catch (e: any) {
      Alert.alert('Export failed', `${e.code}: ${e.message}`);
    }
  };

  // The editor's header has the back arrow, title, save state and sharing.
  return (
    <SafeAreaView style={s.screen}>
      {/* Tap to try the handle's export. */}
      <Text style={s.state} testID="state" onPress={exportFile}>{state}</Text>
      <SigmaSheet
        ref={sheet}
        style={s.flex}
        link={link}
        onBack={async () => { await sheet.current?.save().catch(() => {}); onClose(); }}
        onReady={d => setState(`ready · ${d.format} · ${d.mode}${d.test ? ' · test key' : ''}`)}
        onError={e => setState(`${e.code}: ${e.message}`)}
        onSaveStateChange={st => setState(st)}
      />
    </SafeAreaView>
  );
}

function Button({title, onPress}: {title: string; onPress: () => void}) {
  return (
    <Pressable onPress={onPress} style={s.button}>
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#fff'},
  flex: {flex: 1},
  h1: {fontSize: 24, fontWeight: '700', margin: 16},
  input: {marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 8, backgroundColor: '#f4f5f7'},
  row: {flexDirection: 'row', gap: 8, marginHorizontal: 16},
  muted: {color: '#6e747c', marginHorizontal: 16, marginVertical: 6},
  item: {paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#e2e4e7'},
  title: {fontSize: 16, marginHorizontal: 16},
  bar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8},
  barTitle: {flex: 1, textAlign: 'center', fontWeight: '600', fontSize: 16},
  state: {fontSize: 12, color: '#6e747c', textAlign: 'center', paddingBottom: 4},
  button: {paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#e2f1e5'},
  buttonText: {color: '#188038', fontWeight: '600'},
});
