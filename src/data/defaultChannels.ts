import { ChannelItem } from '../types/index.ts';

export const DEFAULT_CHANNELS: ChannelItem[] = [
  {
    id: 'def_ch_1',
    number: 1,
    name: 'A24 | AR',
    category: 'Argentina',
    logo: 'https://i.postimg.cc/VL2YNmHh/images-q-tbn-ANd9Gc-T8yf-XBu-Qmon9WVy3ETX9fuq0w4U8Hvq391YA-s.png',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    resolution: '1080p Stream',
    isBlocked: false,
    epgNow: { title: 'A24 En Vivo', startTime: '00:00', endTime: '23:59', description: 'Noticias en directo' },
    epgNext: { title: 'Información Continua', startTime: '23:59', endTime: '06:00', description: 'Cobertura 24hs' }
  },
  {
    id: 'def_ch_2',
    number: 2,
    name: 'America TV | AR',
    category: 'Argentina',
    logo: 'https://i.postimg.cc/k4MCH4Dh/America-TV-(Nuevo-logo-Junio-2020).png',
    url: 'https://playertest.longtailvideo.com/adaptive/bipbop/gear4/prog_index.m3u8',
    streamUrl: 'https://playertest.longtailvideo.com/adaptive/bipbop/gear4/prog_index.m3u8',
    resolution: '1080p Stream',
    isBlocked: false,
    epgNow: { title: 'Programación General', startTime: '00:00', endTime: '23:59', description: 'Entretenimiento y actualidad' },
    epgNext: { title: 'Continuidad', startTime: '23:59', endTime: '06:00', description: 'Transmisión sin interrupciones' }
  },
  {
    id: 'def_ch_3',
    number: 3,
    name: 'CRONICA',
    category: 'Argentina',
    logo: 'https://i.postimg.cc/cJ0GKH76/Cronica-TV-logotipo-(2016).png',
    url: 'https://d2zihajmogu5jn.cloudfront.net/bipbop-advanced/bipbop_16x9_variant.m3u8',
    streamUrl: 'https://d2zihajmogu5jn.cloudfront.net/bipbop-advanced/bipbop_16x9_variant.m3u8',
    resolution: '1080p Stream',
    isBlocked: false,
    epgNow: { title: 'Crónica TV En Vivo', startTime: '00:00', endTime: '23:59', description: 'Placa roja y noticias' },
    epgNext: { title: 'Noticias al Día', startTime: '23:59', endTime: '06:00', description: 'Actualidad permanente' }
  },
  {
    id: 'def_ch_4',
    number: 4,
    name: 'ESPN FHD | AR',
    category: 'Argentina',
    logo: 'https://r2.thesportsdb.com/images/media/channel/logo/hdrkql1660762351.png',
    url: 'https://res.cloudinary.com/demo/video/upload/sp_full_hd/dog.m3u8',
    streamUrl: 'https://res.cloudinary.com/demo/video/upload/sp_full_hd/dog.m3u8',
    resolution: '1080p Stream',
    isBlocked: false,
    epgNow: { title: 'Deportes Center', startTime: '00:00', endTime: '23:59', description: 'Noticias deportivas' },
    epgNext: { title: 'Fútbol Internacional', startTime: '23:59', endTime: '06:00', description: 'Partidos y análisis' }
  },
  {
    id: 'def_ch_5',
    number: 5,
    name: 'TyC Sports',
    category: 'Argentina',
    logo: 'https://static.wikia.nocookie.net/logopedia/images/6/61/TyC_Sports.png/revision/latest?cb=20190620182054&path-prefix=es',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    resolution: '1080p Stream',
    isBlocked: false,
    epgNow: { title: 'Superfútbol', startTime: '00:00', endTime: '23:59', description: 'Debates y pasión argentina' },
    epgNext: { title: 'Compactos', startTime: '23:59', endTime: '06:00', description: 'Resúmenes de la fecha' }
  }
];
