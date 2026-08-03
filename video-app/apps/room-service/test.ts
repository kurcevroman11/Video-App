import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { resolve } from 'path';

const PROTO_PATH = resolve(process.cwd(), 'libs/contracts/proto/room.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const roomProto = protoDescriptor.room;

function print(msg: string) {
  console.log(msg);
}

function main() {
  const client = new roomProto.RoomService(
    'localhost:50051',
    grpc.credentials.createInsecure()
  );

  print('=== Testing Room Service ===\n');

  // 1. CreateRoom
  print('1. CreateRoom...');
  client.CreateRoom({
    name: 'Test Room',
    owner_id: 'user-1',
    type: 'PUBLIC',
    max_participants: 10,
  }, (err: any, room: any) => {
    if (err) {
      print('   Error: ' + err.message);
      process.exit(1);
    }
    print('   Room created: ' + JSON.stringify(room));
    const roomId = room.id;

    // 2. GetRoom
    print('\n2. GetRoom...');
    client.GetRoom({ id: roomId }, (err: any, room: any) => {
      if (err) {
        print('   Error: ' + err.message);
        process.exit(1);
      }
      print('   Room fetched: ' + JSON.stringify(room));

      // 3. JoinRoom (user-2)
      print('\n3. JoinRoom (user-2)...');
      client.JoinRoom({
        room_id: roomId,
        user_id: 'user-2'
      }, (err: any, member: any) => {
        if (err) {
          print('   Error: ' + err.message);
          process.exit(1);
        }
        print('   Joined: ' + JSON.stringify(member));

        // 4. JoinRoom (user-3)
        print('\n4. JoinRoom (user-3)...');
        client.JoinRoom({
          room_id: roomId,
          user_id: 'user-3'
        }, (err: any, member: any) => {
          if (err) {
            print('   Error: ' + err.message);
            process.exit(1);
          }
          print('   Joined: ' + JSON.stringify(member));

          // 5. ListParticipants
          print('\n5. ListParticipants...');
          client.ListParticipants({ room_id: roomId }, (err: any, result: any) => {
            if (err) {
              print('   Error: ' + err.message);
              process.exit(1);
            }
            print('   Participants: ' + JSON.stringify(result));

            // 6. CheckAccess (user-2)
            print('\n6. CheckAccess (user-2)...');
            client.CheckAccess({
              room_id: roomId,
              user_id: 'user-2'
            }, (err: any, result: any) => {
              if (err) {
                print('   Error: ' + err.message);
                process.exit(1);
              }
              print('   Access: ' + JSON.stringify(result));

              // 7. CreateInvite
              print('\n7. CreateInvite...');
              client.CreateInvite({
                room_id: roomId,
                created_by: 'user-1'
              }, (err: any, invite: any) => {
                if (err) {
                  print('   Error: ' + err.message);
                  process.exit(1);
                }
                print('   Invite: ' + JSON.stringify(invite));

                print('\n=== All tests passed ===');
                process.exit(0);
              });
            });
          });
        });
      });
    });
  });
}

main();
