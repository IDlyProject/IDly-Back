import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';

/**
 * 개인정보 동의는 증빙이 남아야 하는 항목이다. 화면에서 체크만 받고
 * 서버로 보내지 않으면 기록이 사라지므로, 미동의 요청은 거절한다.
 */
describe('CreateWaitlistDto 동의 검증', () => {
  const base = {
    name: '홍길동',
    phone: '01012345678',
    emails: ['a@gmail.com'],
    ageOver14Agreed: true,
    privacyAgreed: true,
  };

  const messagesOf = async (payload: Record<string, unknown>) => {
    const errors = await validate(plainToInstance(CreateWaitlistDto, payload));
    return errors.flatMap((e) => Object.values(e.constraints ?? {}));
  };

  it('모두 동의하면 통과한다', async () => {
    expect(await messagesOf(base)).toHaveLength(0);
  });

  it('연령 동의가 false면 거절한다', async () => {
    const messages = await messagesOf({ ...base, ageOver14Agreed: false });
    expect(messages).toContain('만 14세 이상 동의가 필요합니다.');
  });

  it('개인정보 동의가 false면 거절한다', async () => {
    const messages = await messagesOf({ ...base, privacyAgreed: false });
    expect(messages).toContain('개인정보 수집·이용 동의가 필요합니다.');
  });

  it('동의 항목이 아예 없으면 거절한다', async () => {
    const { ageOver14Agreed, privacyAgreed, ...withoutConsents } = base;
    void ageOver14Agreed;
    void privacyAgreed;
    expect((await messagesOf(withoutConsents)).length).toBeGreaterThan(0);
  });
});
