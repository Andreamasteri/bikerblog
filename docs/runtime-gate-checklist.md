# AI runtime gate checklist (inactive)

This gate is mandatory before enabling queues or flags, changing GPU or
resource assignments, running real smoke tests, enabling AI-Hub routing, or
rolling out.

Run direct checks on the Windows PC, ThinkCentre and Ares host. For every
host and worker record only the presence of secrets, never their values:

- host and reachability
- active processes, worker/service identity
- GPU index, model and free VRAM
- loaded model or audio runtime
- resource group
- queue
- endpoint
- secret name present and usable

Reconcile the results with the role registry and resources configuration.
Any discrepancy blocks activation. This checklist is documentation only and
does not enable traffic.
