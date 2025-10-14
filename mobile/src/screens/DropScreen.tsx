import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Pressable, Modal, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import TopBar from '../components/TopBar';
import { colors, card, type, radius, getTheme } from '../theme';
import { saveDevice } from '../services/api';
import { useDarkMode } from '../../App';

type Person = { id:string; name:string; distanceFt:number; bio?:string; visibility?:'Public'|'Private' };
const mockNearby: Person[] = [
  { id:'1', name:'A. Nguyen',    distanceFt:12, bio:'Tinkers with firmware', visibility:'Public' },
  { id:'2', name:'Blue Jacket',  distanceFt:18, bio:'Ask me about coffee.',   visibility:'Public' },
  { id:'3', name:'Jess M',       distanceFt:24, visibility:'Public' },
  { id:'4', name:'KJ',           distanceFt:32, visibility:'Private' },
  { id:'5', name:'M. Patel',     distanceFt:41, visibility:'Public' },
  { id:'6', name:'Rae',          distanceFt:48, visibility:'Public' },
];

export default function DropScreen() {
  const [active, setActive] = useState<Person|null>(null);
  const [incomingDrop, setIncomingDrop] = useState<{ name: string; text: string } | null>(null);
  const [bounceAnim] = useState(new Animated.Value(0));
  const { isDarkMode } = useDarkMode();
  const theme = getTheme(isDarkMode);

  const handleDrop = async (p: Person) => {
    await saveDevice({ name: p.name, rssi: -60, distanceFeet: p.distanceFt, action: 'dropped' });
    setActive(null);
  };

  // Simulate receiving a drop (you can trigger this manually for testing)
  const simulateIncomingDrop = () => {
    const mockDrops = [
      { name: 'Sarah Chen', text: 'Wants to share their contact card.' },
      { name: 'Alex Rivera', text: 'Interested in networking.' },
      { name: 'Jordan Kim', text: 'Looking to connect professionally.' },
    ];
    const randomDrop = mockDrops[Math.floor(Math.random() * mockDrops.length)];
    setIncomingDrop(randomDrop);
    
    // Trigger bounce animation
    Animated.sequence([
      Animated.timing(bounceAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(bounceAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleIncomingAction = async (action: 'accepted' | 'returned' | 'declined') => {
    if (incomingDrop) {
      await saveDevice({ 
        name: incomingDrop.name, 
        rssi: -55, 
        distanceFeet: 18, 
        action 
      });
      setIncomingDrop(null);
    }
  };

  return (
    <View style={{ flex:1, backgroundColor: theme.colors.bg }}>
      <TopBar title="Drop" />
      
      {/* Floating Contact Card Notification */}
      {incomingDrop && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 60,
            right: 16,
            zIndex: 1000,
            transform: [{
              scale: bounceAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.1],
              }),
            }],
          }}
        >
          <View style={{
            backgroundColor: theme.colors.white,
            borderRadius: 12,
            padding: 12,
            minWidth: 200,
            maxWidth: 250,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 8,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <View style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.colors.blue,
                marginRight: 8,
              }} />
              <Text style={[theme.type.h2, { fontSize: 14 }]}>New Drop</Text>
            </View>
            <Text style={[theme.type.body, { fontSize: 14, marginBottom: 8 }]}>
              {incomingDrop.name} just sent you a drop
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pressable
                onPress={() => handleIncomingAction('accepted')}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.blue,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                }}
              >
                <Text style={[theme.type.button, { fontSize: 12, textAlign: 'center' }]}>
                  Accept
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleIncomingAction('returned')}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.blue,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                }}
              >
                <Text style={[theme.type.button, { fontSize: 12, textAlign: 'center' }]}>
                  Return
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleIncomingAction('declined')}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.bg,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={[theme.type.body, { fontSize: 12, textAlign: 'center', color: theme.colors.muted }]}>
                  Decline
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}


      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom:80 }}
        ListHeaderComponent={
          <View style={{ ...theme.card, backgroundColor: theme.colors.bg, marginBottom: 12 }}>
            <Text style={theme.type.muted}>Scanning nearby…</Text>
          </View>
        }
        data={mockNearby}
        keyExtractor={(i)=>i.id}
        renderItem={({ item }) => (
            <Pressable
              onPress={() => setActive(item)}
              style={({ pressed }) => ({
                ...theme.card,
                marginTop: 12,
                borderColor: pressed ? theme.colors.blue : theme.card.borderColor,
              })}
            >
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                <Text style={theme.type.h1}>{item.name}</Text>
                <Text style={theme.type.muted}>{item.distanceFt} ft</Text>
              </View>
            </Pressable>
          )}
        />

      {/* Profile modal */}
      <Modal visible={!!active} transparent animationType="fade" onRequestClose={()=>setActive(null)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.18)', justifyContent:'center', padding:20 }}>
          <View style={{ ...theme.card, padding:22 }}>
            <Text style={{ ...theme.type.h1, textAlign:'center', marginBottom:6 }}>{active?.name}</Text>
            {!!active?.bio && <Text style={{ ...theme.type.muted, textAlign:'center' }}>{active.bio}</Text>}
            <Text style={{ ...theme.type.muted, textAlign:'center', marginTop:4 }}>
              Visibility: {active?.visibility ?? 'Public'} • {active?.distanceFt} ft away
            </Text>

            {/* Bottom action bar */}
            <View style={{ marginTop:18, borderTopColor: theme.colors.border, borderTopWidth:1, paddingTop:14 }}>
              <Pressable
                onPress={() => active && handleDrop(active)}
                style={({ pressed }) => ({
                  backgroundColor: theme.colors.blue,
                  paddingVertical:14,
                  borderRadius: radius.pill,
                  alignItems:'center',
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={theme.type.button}>Drop</Text>
              </Pressable>

              <Pressable onPress={()=>setActive(null)} style={{ alignSelf:'center', marginTop:12 }}>
                <Text style={theme.type.muted}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
