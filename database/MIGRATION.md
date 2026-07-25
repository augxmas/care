# DB 이관 가이드

## 파일 구성

| 파일 | 용도 |
|------|------|
| `schema.sql` | 전체 DDL (테이블, 함수, 인덱스, 초기 설정값) |
| `dump.sql`   | 현재 운영 DB 전체 스냅샷 (스키마 + 데이터) |
| `backup.sql` | 운영 DB 내부에 타임스탬프 백업 스키마 생성 (오브젝트/데이터/메타데이터) |

---

## A. 신규 서버에 DB 구축 (이관)

### 1. MariaDB 설치 확인
```bash
mariadb --version   # 10.5 이상 권장
```

### 2. DB 및 유저 생성 (root 권한)
```sql
CREATE DATABASE IF NOT EXISTS advertise
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'advertiser'@'localhost'
  IDENTIFIED BY 'your_db_password';

GRANT ALL PRIVILEGES ON advertise.* TO 'advertiser'@'localhost';
FLUSH PRIVILEGES;
```
> `.env` 의 `DB_USER` / `DB_PASSWORD` 와 동일한 값을 사용하세요.

### 3. 데이터 이관 (dump.sql 적용)
기존 운영 데이터를 그대로 옮길 때 사용합니다.
```bash
mariadb -h localhost -u advertiser -p advertise < database/dump.sql
```

### 4. 검증
```sql
USE advertise;
SHOW TABLES;
SELECT COUNT(*) FROM advertisers;
SELECT COUNT(*) FROM campaigns;
SELECT fn_encrypt('test');   -- 암복호화 함수 동작 확인
```

---

## B. 빈 DB에 스키마만 설치 (개발 환경 / 클린 설치)

```bash
mariadb -h localhost -u advertiser -p advertise < database/schema.sql
```

초기 데이터 없이 스키마와 시스템 기본값(system_config)만 생성됩니다.

---

## C. dump.sql 갱신 방법

운영 DB 변경 후 형상관리에 최신 상태를 반영하려면:

```bash
# Windows (MariaDB 설치 경로에 맞게 조정)
"C:\Program Files\MariaDB 12.2\bin\mysqldump.exe" \
  -h localhost -u advertiser -p \
  --default-character-set=utf8mb4 \
  --complete-insert --add-drop-table \
  --routines --triggers \
  --databases advertise > database/dump.sql

# Linux / macOS
mysqldump -h localhost -u advertiser -p \
  --default-character-set=utf8mb4 \
  --complete-insert --add-drop-table \
  --routines --triggers \
  --databases advertise > database/dump.sql
```

배포 전 운영 DB 내부에 즉시 복구용 백업 스키마를 남길 때는:

```bash
mariadb -h localhost -u root -p < database/backup.sql
```

실행 결과로 `advertise_backup_YYYYMMDD_HHMMSS` 스키마가 생성되며, 테이블 구조/데이터와 DB 오브젝트 및 인스턴스 메타데이터 스냅샷이 함께 저장됩니다.

---

## D. 암복호화 키 변경 시 주의사항

`ENCRYPT_KEY` (`.env`) 와 `schema.sql` 의 `fn_encrypt` / `fn_decrypt` 함수 내
`SHA2('...', 256)` 인자는 **반드시 동일**해야 합니다.

키를 변경하면 기존에 암호화된 컬럼(이메일, 담당자명 등) 데이터를 읽을 수 없습니다.
기존 데이터가 있는 경우 반드시 재암호화 절차를 수행하세요.

---

## E. 환경 변수 설정

```bash
cp .env.example .env
# .env 를 열어 각 항목 입력
```

주요 체크 항목:
- `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD`
- `SESSION_SECRET` — 무작위 32자 이상 문자열
- `ENCRYPT_KEY` — 기존 DB와 **동일한 값** 유지
- `SMTP_*` — 이메일 발송 설정
- `SUPERVISOR_PASSWORD` — supervisor 로그인 비밀번호
