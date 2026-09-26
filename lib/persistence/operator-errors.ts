import {ProjectError} from '../projects/store';
import {redactSecretText} from '../security/secret-content';
/** Explain known preconditions while keeping arbitrary driver messages and connection strings private. */
export function postgresOperationError(error:unknown):string {
 const detail=error instanceof ProjectError?' Reason: '+redactSecretText(error.message).slice(0,400)+' ('+error.status+').':'';
 return 'PostgreSQL operation failed.'+detail+' Check the operator connection, role, source schema, private key, empty target and permissions. Existing target data are not overwritten; runtime activation is separate.';
}
