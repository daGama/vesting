export const CONFIG = {
  test: {
    startRoundIncrement: 0,
    cliffDuration: 600,
    vestingDuration: 600,
    tgep: 500,
    cap: 1e10,
  },
  prod: {
    startRoundIncrement: 60,
    cliffDuration: 0,
    vestingDuration: 20 * 24 * 3600,
    tgep: 500,
    cap: 1e10,
    tokenContract: '0xF4460c8738B770FC9e56bfc4E3E74E559B7610Ff',
    treasure: '0x87fc1a011937872225006b35878171265819D400',
  }
};

export default Object.values(CONFIG.prod);