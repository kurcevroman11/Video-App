export class RoomNotFoundException extends Error {
  constructor(roomId: string) {
    super(`Room with ID ${roomId} not found`);
    this.name = 'RoomNotFoundException';
  }
}

export class ForbiddenActionException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenActionException';
  }
}

export class MemberNotFoundException extends Error {
  constructor(roomId: string, userId: string) {
    super(`Member with userId ${userId} not found in room ${roomId}`);
    this.name = 'MemberNotFoundException';
  }
}

export class InviteNotFoundException extends Error {
  constructor(code: string) {
    super(`Invite with code ${code} not found`);
    this.name = 'InviteNotFoundException';
  }
}

export class InviteExpiredException extends Error {
  constructor(code: string) {
    super(`Invite with code ${code} has expired`);
    this.name = 'InviteExpiredException';
  }
}

export class InviteMaxUsesReachedException extends Error {
  constructor(code: string) {
    super(`Invite with code ${code} has reached maximum uses`);
    this.name = 'InviteMaxUsesReachedException';
  }
}

export class InviteInvalidException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InviteInvalidException';
  }
}

export class ConflictException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictException';
  }
}
