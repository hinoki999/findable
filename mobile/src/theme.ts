export const colors = {
  blue: '#007AFF', // Apple System Blue
  bg:   '#F6F8FB',
  border: '#E6EAF2',
  text:  '#111827',
  muted: '#6E7DA0',
  white: '#FFFFFF',
  blueLight: '#E5F1FF',
  green: '#34C759', // Apple System Green
  greenLight: '#D1F2DB',
};

export const darkColors = {
  blue: '#007AFF', // Apple System Blue
  bg:   '#000000',
  border: '#333333',
  text:  '#FFFFFF',
  muted: '#CCCCCC',
  white: '#1A1A1A',
  blueLight: '#1E3A8A',
  green: '#34C759', // Apple System Green
  greenLight: '#1A3A24',
};

export const radius = { sm:10, md:14, lg:20, pill:999 };
export const shadow = { 
  lite: { shadowColor:'#000', shadowOpacity:0.06, shadowRadius:8, shadowOffset:{width:0,height:4}, elevation:2 }
};

export const card = {
  backgroundColor: colors.white,
  borderColor: colors.border,
  borderWidth: 1,
  borderRadius: radius.lg,
  padding: 16,
  ...shadow.lite,
};

export const getTheme = (isDark: boolean) => {
  const themeColors = isDark ? darkColors : colors;
  return {
    colors: themeColors,
    card: {
      backgroundColor: themeColors.white,
      borderColor: themeColors.border,
      borderWidth: 1,
      borderRadius: radius.lg,
      padding: 16,
      ...shadow.lite,
    },
    type: {
      title:   { fontSize: 22, fontWeight: '400' as const, color: themeColors.blue,   fontFamily: 'Inter_400Regular' },
      h1:      { fontSize: 20, fontWeight: '400' as const, color: themeColors.blue,   fontFamily: 'Inter_400Regular' },
      h2:      { fontSize: 18, fontWeight: '500' as const, color: themeColors.text,   fontFamily: 'Inter_500Medium'   },
      body:    { fontSize: 16,                           color: themeColors.text,     fontFamily: 'Inter_400Regular'  },
      muted:   { fontSize: 15,                           color: themeColors.muted,    fontFamily: 'Inter_400Regular'  },
      button:  { fontSize: 16, fontWeight:'500' as const, color: themeColors.white,   fontFamily: 'Inter_500Medium' },
      tab:     { fontSize: 14,                           color: themeColors.blue,     fontFamily: 'Inter_400Regular'   },
    }
  };
};

export const type = {
  title:   { fontSize: 22, fontWeight: '400' as const, color: colors.blue,   fontFamily: 'Inter_400Regular' },
  h1:      { fontSize: 20, fontWeight: '400' as const, color: colors.blue,   fontFamily: 'Inter_400Regular' },
  h2:      { fontSize: 18, fontWeight: '500' as const, color: colors.text,   fontFamily: 'Inter_500Medium'   },
  body:    { fontSize: 16,                           color: colors.text,     fontFamily: 'Inter_400Regular'  },
  muted:   { fontSize: 15,                           color: colors.muted,    fontFamily: 'Inter_400Regular'  },
  button:  { fontSize: 16, fontWeight:'500' as const, color: colors.white,   fontFamily: 'Inter_500Medium' },
  tab:     { fontSize: 14,                           color: colors.blue,     fontFamily: 'Inter_400Regular'   },
};