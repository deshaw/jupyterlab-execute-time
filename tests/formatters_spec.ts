import { getTimeString, getTimeDiff } from '../src/formatters';
import { expect } from 'chai';

// Prop#12342
describe('formatters', () => {
  it('formats time strings', () => {
    expect(getTimeString(new Date(2019, 11, 3, 16, 4, 42, 10))).to.eql(
      '2019-12-03 16:04:42'
    );
  });
  it('Creates human readable times differences', () => {
    const startTimeInMsSinceEpoch = 1575410562487;
    const startTime = new Date(startTimeInMsSinceEpoch);
    expect(
      getTimeDiff(new Date(startTimeInMsSinceEpoch + 17), startTime)
    ).to.eql('17ms');
    expect(
      getTimeDiff(new Date(startTimeInMsSinceEpoch + 132), startTime)
    ).to.eql('132ms');
    expect(
      getTimeDiff(new Date(startTimeInMsSinceEpoch + 1024), startTime)
    ).to.eql('1.02s');
    expect(
      getTimeDiff(
        new Date(startTimeInMsSinceEpoch + 60 * 1000 * 2 + 1821),
        startTime
      )
    ).to.eql('2m 1.82s');
    expect(
      getTimeDiff(
        new Date(startTimeInMsSinceEpoch + 60 * 60 * 1000 * 2 + 1821),
        startTime
      )
    ).to.eql('2h 0m 2s');
    expect(
      getTimeDiff(
        new Date(
          startTimeInMsSinceEpoch +
            24 * 60 * 60 * 1000 +
            60 * 60 * 1000 * 2 +
            60 * 1000 * 18
        ),
        startTime
      )
    ).to.eql('1d 2h 18m');
  });
});
