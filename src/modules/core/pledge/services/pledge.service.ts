import { Injectable, NotFoundException } from '@nestjs/common';

import type { Pledge } from '@prisma/client';

import type { CreatePledgeInput, PledgeFilters, UpdatePledgeInput } from '../pledge.types';
import type { PledgeListResult } from '../repository/pledge.repository';
import { PledgeRepository } from '../repository/pledge.repository';

@Injectable()
export class PledgeService {
  constructor(private readonly pledgeRepository: PledgeRepository) {}

  async create(data: CreatePledgeInput): Promise<Pledge> {
    return this.pledgeRepository.create(data);
  }

  async getById(tenantId: string, id: string): Promise<Pledge> {
    const pledge = await this.pledgeRepository.findById(tenantId, id);
    if (!pledge) throw new NotFoundException(`Pledge not found: ${id}`);
    return pledge;
  }

  async getAll(tenantId: string, filters?: PledgeFilters): Promise<PledgeListResult> {
    return this.pledgeRepository.findAll(tenantId, filters ?? {});
  }

  async update(tenantId: string, id: string, data: UpdatePledgeInput): Promise<Pledge> {
    await this.getById(tenantId, id);
    return this.pledgeRepository.update(tenantId, id, data);
  }

  async delete(tenantId: string, id: string): Promise<Pledge> {
    await this.getById(tenantId, id);
    return this.pledgeRepository.softDelete(tenantId, id);
  }
}
