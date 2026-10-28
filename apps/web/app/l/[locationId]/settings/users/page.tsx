import { locationMembers, ROLE_LABELS } from "@tidal/core";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, Td, Th } from "@/components/ui/table";
import { getLocationContext, inLocation } from "@/lib/context";
import { addLocationMember, removeLocationMember } from "../actions";

export default async function UsersSettings({ params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  const { location, access, user } = await getLocationContext(locationId);
  const members = await inLocation(locationId, (tx) => locationMembers(tx, locationId, location.agencyId));

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title="Users" description={`People with access to ${location.name}. Agency members reach every sub-account.`} />
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.membershipId}>
                <Td className="font-medium">{m.name ?? "—"}</Td>
                <Td className="text-muted">{m.email}</Td>
                <Td>
                  {ROLE_LABELS[m.role]} {m.viaAgency ? <Badge>via agency</Badge> : null}
                </Td>
                <Td className="text-right">
                  {access.canAdmin && !m.viaAgency && m.userId !== user.id ? (
                    <form action={removeLocationMember.bind(null, locationId, m.membershipId)}>
                      <Button type="submit" variant="ghost" size="sm">Remove</Button>
                    </form>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {access.canAdmin ? (
        <Card>
          <CardHeader title="Add a user" description="They sign in with Google using this email." />
          <ActionForm action={addLocationMember.bind(null, locationId)} submitLabel="Add user" className="grid gap-4 p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Email" htmlFor="email">
                <Input id="email" name="email" type="email" required />
              </Field>
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" />
              </Field>
              <Field label="Role" htmlFor="role">
                <Select id="role" name="role" defaultValue="user">
                  <option value="user">{ROLE_LABELS.user}</option>
                  <option value="location_admin">{ROLE_LABELS.location_admin}</option>
                </Select>
              </Field>
            </div>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
