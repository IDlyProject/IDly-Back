import { HomeResponseDto } from './dto/home-response.dto';

/**
 * 서비스가 내려주는 키와 Swagger DTO 선언이 어긋나면, 프론트는 스펙만 보고
 * "아직 구현 안 된 필드"로 오해한다. 실제로 immediateActions가 DTO에 없어
 * 미구현으로 읽힌 적이 있어 계약을 테스트로 고정한다.
 */
describe('HomeResponseDto 계약', () => {
  const declared = () => {
    const dto = new HomeResponseDto();
    // ApiProperty만으로는 런타임 키가 생기지 않으므로 소스 선언을 직접 확인한다.
    return Object.keys(dto);
  };

  it('immediateActions가 DTO에 선언돼 있다', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, 'dto/home-response.dto.ts'),
      'utf8',
    ) as string;

    expect(source).toContain('immediateActions: HomeImmediateActionDto[]');
    expect(source).toContain('class HomeImmediateActionDto');
  });

  it('즉시 할 일 항목이 프론트에 필요한 필드를 모두 선언한다', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, 'dto/home-response.dto.ts'),
      'utf8',
    ) as string;
    const block = source.slice(
      source.indexOf('class HomeImmediateActionDto'),
      source.indexOf('export class HomeResponseDto'),
    );

    for (const field of ['id', 'serviceAccountId', 'severity', 'title', 'description']) {
      expect(block).toContain(`${field}:`);
    }
  });

  it('Swagger 설명에 목 데이터라는 낡은 표현이 남아 있지 않다', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, 'home.controller.ts'),
      'utf8',
    ) as string;

    expect(source).not.toContain('목 데이터');
    expect(source).not.toContain('목데이터');
  });

  it('DTO 인스턴스는 생성 가능하다', () => {
    expect(declared()).toBeDefined();
  });
});
