import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { InvitesService } from './invites.service';

@Controller()
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @GrpcMethod('RoomService', 'CreateInvite')
  async createInvite(data: any) {
    return this.invitesService.createInvite({
      roomId: data.room_id,
      createdBy: data.created_by,
      maxUses: data.max_uses,
      expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
    });
  }
}
