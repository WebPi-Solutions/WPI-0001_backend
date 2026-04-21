import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseAccessService } from 'src/api/common/enterprise-access.service';
import { DefaultScheduleRepository } from 'src/entities/default-schedule/default-schedule-repository.service';
import { UserRepository } from 'src/entities/user/user-repository.service';
import { FirebaseService } from 'src/services/firebase/firebase.service';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: UserRepository, useValue: {} },
        { provide: FirebaseService, useValue: {} },
        { provide: EnterpriseAccessService, useValue: {} },
        { provide: DefaultScheduleRepository, useValue: {} },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
