export const CONFIG = {
  test: {
    startRoundIncrement: 0,
    cap: 1e10,
  },
  prod: {
    owner: '0x87fc1a011937872225006b35878171265819D400',
    startRoundIncrement: 1710918492,
    cap: 21e15.toString(),
    tokenContract: '0xF4460c8738B770FC9e56bfc4E3E74E559B7610Ff',
  }
};

export default Object.values(CONFIG.prod);